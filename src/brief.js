// Risks brief: code picks the facts, the model only words them (ADR 0008),
// and every bullet must cite PRs that were in its input (ADR 0003).

export const MIN_BULLETS = 4;
export const MAX_BULLETS = 6;
// Reasoning models spend part of this budget before writing; 900 truncated a reply.
export const MAX_OUTPUT_TOKENS = 1500;
export const COST_CAP_USD = 0.05;
export const ATTEMPTS = 2;
const TOP_BOTTLENECKS = 8;
const EXAMPLES_PER_QUEUE = 5;

// Queue names as noun phrases the brief can use as-is, never the classifier's labels.
export const QUEUE_NAMES = {
  untouched: 'PRs with no human response yet',
  reviewer: "PRs waiting for a reviewer's lgtm",
  approver: 'PRs with lgtm, waiting for an approver',
  'merge-pending': 'approved PRs waiting to merge',
  author: 'PRs waiting on their author (rebase, requested changes or a process label)',
};

// Ranks as words: "#1" in a fact would read as a PR citation if the model copied it.
const RANK_WORDS = ['Largest', 'Second largest', 'Third largest', 'Fourth largest', 'Fifth largest', 'Sixth largest', 'Seventh largest', 'Eighth largest'];

// Whole-repo queue sentences, singular-aware: (count, isOne) => clause.
const REPO_QUEUE_SENTENCES = {
  untouched: (n, one) => `${n} open ${one ? 'PR has' : 'PRs have'} no human response yet`,
  reviewer: (n, one) => `${n} open ${one ? 'PR is' : 'PRs are'} waiting for a reviewer's lgtm`,
  approver: (n, one) => `${n} open ${one ? 'PR has' : 'PRs have'} lgtm and ${one ? 'is' : 'are'} waiting for an approver`,
  'merge-pending': (n, one) => `${n} approved ${one ? 'PR is' : 'PRs are'} waiting to merge`,
  author: (n, one) => `${n} open ${one ? 'PR is' : 'PRs are'} waiting on ${one ? 'its' : 'their'} author (rebase, requested changes or a process label)`,
};

// Phrases a rejected draft overused. A brief that leans on them reads as a template.
export const BANNED_PHRASES = ['which matters because', 'it matters because'];

// Rough token count. 3 characters per token over-counts for English and JSON,
// so the estimate errs high.
export const estimateTokens = (text) => Math.ceil(text.length / 3);

/** Numbers stated in text, ignoring PR references (#123). "1,270" reads as 1270. */
export function numbersIn(text) {
  const withoutPrs = text.replace(/#\d+/g, ' ');
  return [...withoutPrs.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
}

/** A duration in days as the reader should see it: "1.7 hours", "4.1 days", "85 days". */
export function humanDays(days) {
  if (days === null || days === undefined) return null;
  if (days < 1) return `${(days * 24).toFixed(1)} hours`;
  if (days < 10) return `${days.toFixed(1)} days`;
  return `${Math.round(days)} days`;
}

const longestWaiting = (records, n) =>
  [...records].sort((a, b) => b.waitingDays - a.waitingDays || a.number - b.number).slice(0, n).map((r) => r.number);

const pct = (part, whole) => Math.round((part / whole) * 100);
const count = (n) => n.toLocaleString('en-US');

/**
 * Comparisons computed here, never by the model (ADR 0008). Each carries its own
 * examples to cite. Team shares count distinct PRs, since a PR can carry several SIG labels.
 */
export function buildComparisons(metrics) {
  const o = metrics.overall;
  const open = metrics.prs.open;
  const out = [];

  const review = o.merged.review;
  const mergeWait = o.merged.mergeWait;
  if (review.median !== null && review.p90 !== null && mergeWait.median !== null) {
    const slowest = [...metrics.prs.merged].filter((r) => r.review !== null).sort((a, b) => b.review - a.review || a.number - b.number);
    out.push({
      fact: `On merged PRs, getting to lgtm took a median ${humanDays(review.median)}, but 1 in 10 took about ${humanDays(review.p90)} or longer. Once both review labels were set, the median PR merged in ${humanDays(mergeWait.median)}.`,
      examples: slowest.slice(0, EXAMPLES_PER_QUEUE).map((r) => r.number),
    });
  }

  const reviewQueue = open.filter((r) => r.state === 'reviewer');
  const topSigs = metrics.bottlenecks.filter((b) => b.state === 'reviewer').slice(0, 2).map((b) => b.sig);
  if (topSigs.length === 2 && reviewQueue.length > 0) {
    const inTop = reviewQueue.filter((r) => r.groups.some((g) => topSigs.includes(g)));
    out.push({
      fact: `${count(inTop.length)} of the ${count(reviewQueue.length)} ${QUEUE_NAMES.reviewer} across the repo (${pct(inTop.length, reviewQueue.length)}%) are labeled sig/${topSigs[0]} or sig/${topSigs[1]}.`,
      examples: longestWaiting(inTop, EXAMPLES_PER_QUEUE),
    });
  }

  const untouched = open.filter((r) => r.state === 'untouched');
  if (untouched.length > 0) {
    out.push({
      fact: `${count(untouched.length)} of ${count(open.length)} open PRs (${pct(untouched.length, open.length)}%) have no human response yet.`,
      examples: longestWaiting(untouched, EXAMPLES_PER_QUEUE),
    });
  }

  const author = o.backlog.author.count;
  const reviewer = o.backlog.reviewer.count;
  if (author > 0 && reviewer > 0) {
    out.push({
      fact: `${count(author)} open PRs are waiting on their author, close to the ${count(reviewer)} waiting for a reviewer's lgtm.`,
      examples: longestWaiting(open.filter((r) => r.state === 'author'), EXAMPLES_PER_QUEUE),
    });
  }
  return out;
}

/**
 * The fact sheet the model sees: every fact is a finished sentence with its own
 * examples to cite, so there are no field names for the model to copy into the
 * brief. Durations are pre-rounded and every number is computed here.
 */
export function buildInput(metrics) {
  const o = metrics.overall;
  const stages = o.merged;
  const facts = [];

  facts.push({
    fact: `Over ${metrics.window.from.slice(0, 10)} to ${metrics.window.to.slice(0, 10)}, ${count(stages.n)} PRs merged. From ready for review to merged took a median ${humanDays(stages.cycle.median)}; 1 in 10 took about ${humanDays(stages.cycle.p90)} or longer.`,
    examples: [...metrics.prs.merged].filter((r) => r.cycle !== null).sort((a, b) => b.cycle - a.cycle || a.number - b.number)
      .slice(0, EXAMPLES_PER_QUEUE).map((r) => r.number),
  });

  for (const state of Object.keys(QUEUE_NAMES)) {
    const b = o.backlog[state];
    if (b.count === 0) continue;
    const wait = b.waitingDays.median === null ? '' : `, with a median wait of ${humanDays(b.waitingDays.median)}`;
    facts.push({
      fact: `Across the repo, ${REPO_QUEUE_SENTENCES[state](count(b.count), b.count === 1)}${wait}.`,
      examples: longestWaiting(metrics.prs.open.filter((r) => r.state === state), EXAMPLES_PER_QUEUE),
    });
  }

  for (const b of metrics.bottlenecks.slice(0, TOP_BOTTLENECKS)) {
    facts.push({
      fact: `${RANK_WORDS[b.rank - 1] ?? `Number ${b.rank}`} by total waiting: sig/${b.sig} has ${count(b.count)} ${QUEUE_NAMES[b.state]}, with a median wait of ${humanDays(b.medianWaitDays)} (${count(b.prDays)} PR-days of waiting in total).`,
      examples: b.examples,
    });
  }

  facts.push(...buildComparisons(metrics));
  return { repo: metrics.repo, dataFetched: metrics.fetchedAt.slice(0, 10), facts };
}

/** Each "examples" list in the input. A bullet must cite from exactly one of them. */
export function citationGroups(input) {
  return input.facts.map((f) => f.examples);
}

const SYSTEM = `You write a short risks brief for an engineering program manager about where pull requests wait in an open-source project.

Rules:
- Use only the facts in the JSON you are given. Copy numbers and durations exactly as written; do not round, convert or compute new ones.
- Write ${MIN_BULLETS} to ${MAX_BULLETS} bullets, each one or two plain sentences. Lead with the finding, then the numbers.
- Each bullet rewords one or two facts from "facts" in plain English. Do not use any JSON key names in the text.
- Prefer the comparison facts (shares, "close to", median versus slowest 10%): use at least two of them. Do not compute any comparison, share or total yourself.
- Do not speculate about consequences or causes the data does not show (for example releases, downstream work, morale or staffing).
- Vary sentence structure. Do not start two bullets the same way. Never write "which matters because".
- Every bullet cites 1 to 5 PRs in its "prs" array, all from the "examples" list of one fact that bullet describes. Never cite any other PR.
- Talk about teams, stages and queues. Never name or describe individual people.
- Do not claim to know the project's internal priorities, staffing or intentions.

Reply with JSON only, no prose and no code fences, in exactly this shape:
{"bullets":[{"text":"...","prs":[123456]}]}`;

// Structured output: the provider must return exactly this shape, so a reply is
// always parseable JSON. The validator still checks the content.
export const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'risks_brief',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        bullets: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, prs: { type: 'array', items: { type: 'integer' } } },
            required: ['text', 'prs'],
            additionalProperties: false,
          },
        },
      },
      required: ['bullets'],
      additionalProperties: false,
    },
  },
};

export function buildMessages(input, feedback = null) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(input) },
  ];
  if (feedback) {
    messages.push({ role: 'user', content: `Your previous reply was rejected:\n- ${feedback.join('\n- ')}\nReply again with corrected JSON only.` });
  }
  return messages;
}

/** Parse a model reply into a brief, tolerating code fences and stray prose. */
export function parseBrief(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('reply contains no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Reject anything uncited, any citation not in the input, citations mixed from
 * different queues, @mentions, banned phrases and field names. `groups` is
 * citationGroups(). Optional ground-truth checks (src/brief-checks.js):
 * `numbers` rejects any number not in the input facts, `traps` rejects known
 * false or unsupported claims.
 */
export function validateBrief(brief, groups, { numbers = null, traps = [] } = {}) {
  const errors = [];
  const allowed = new Set(groups.flat());
  const bullets = brief?.bullets;
  if (!Array.isArray(bullets)) return { ok: false, errors: ['"bullets" must be an array'] };
  if (bullets.length < MIN_BULLETS || bullets.length > MAX_BULLETS) {
    errors.push(`expected ${MIN_BULLETS} to ${MAX_BULLETS} bullets, got ${bullets.length}`);
  }
  bullets.forEach((b, i) => {
    const n = i + 1;
    if (typeof b?.text !== 'string' || b.text.trim() === '') {
      errors.push(`bullet ${n} has no text`);
      return;
    }
    if (!Array.isArray(b.prs) || b.prs.length === 0) {
      errors.push(`bullet ${n} cites no PRs`);
    } else {
      for (const pr of b.prs) {
        if (!Number.isInteger(pr)) errors.push(`bullet ${n} cites "${pr}", which is not a PR number`);
        else if (!allowed.has(pr)) errors.push(`bullet ${n} cites #${pr}, which is not in the input`);
      }
      const inputPrs = b.prs.filter((pr) => allowed.has(pr));
      if (inputPrs.length === b.prs.length && !groups.some((g) => inputPrs.every((pr) => g.includes(pr)))) {
        errors.push(`bullet ${n} mixes citations from different queues; cite from the one queue it describes`);
      }
    }
    for (const m of b.text.matchAll(/#(\d+)/g)) {
      if (!allowed.has(Number(m[1]))) errors.push(`bullet ${n} mentions #${m[1]}, which is not in the input`);
    }
    if (/(^|\s)@[A-Za-z0-9-]/.test(b.text)) errors.push(`bullet ${n} mentions a person (@handle)`);
    const fieldName = b.text.match(/\b[a-z]+[A-Z][A-Za-z]*\b/);
    if (fieldName) errors.push(`bullet ${n} uses the field name "${fieldName[0]}"; write it in plain words`);
    for (const phrase of BANNED_PHRASES) {
      if (b.text.toLowerCase().includes(phrase)) errors.push(`bullet ${n} uses "${phrase}"`);
    }
    if (numbers) {
      for (const x of new Set(numbersIn(b.text).filter((x) => !numbers.has(x)))) {
        errors.push(`bullet ${n} states ${x}, which is not in the input facts`);
      }
    }
    for (const t of traps.filter((t) => t.block && t.pattern.test(b.text))) {
      errors.push(`bullet ${n} claims something the data contradicts or cannot support (${t.id}): ${t.evidence}`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** Clean bullets for publishing: trimmed text, de-duplicated citations. */
export const cleanBullets = (bullets) => bullets.map((b) => ({ text: b.text.trim(), prs: [...new Set(b.prs)] }));

/**
 * Worst-case cost in USD for one attempt. `pricing` is OpenRouter's per-token
 * price strings, e.g. { prompt: "0.000001", completion: "0.000005" }.
 */
export function estimateCost(messages, pricing) {
  const inputTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  const usd = inputTokens * Number(pricing.prompt) + MAX_OUTPUT_TOKENS * Number(pricing.completion);
  return { inputTokens, outputTokens: MAX_OUTPUT_TOKENS, usd };
}
