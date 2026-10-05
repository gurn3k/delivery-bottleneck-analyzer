// Weekly risks brief: code picks the facts, the model only words them (ADR 0008),
// and every bullet must cite PRs that were in its input (ADR 0003).

export const MIN_BULLETS = 4;
export const MAX_BULLETS = 6;
export const MAX_OUTPUT_TOKENS = 900;
export const COST_CAP_USD = 0.05;
export const ATTEMPTS = 2;
const TOP_BOTTLENECKS = 8;

// Rough token count. 3 characters per token over-counts for English and JSON,
// so the estimate errs high.
export const estimateTokens = (text) => Math.ceil(text.length / 3);

const pick = (stats, keys) => Object.fromEntries(keys.map((k) => [k, stats[k]]));

/** The compact fact sheet the model sees. Only PRs listed here may be cited. */
export function buildInput(metrics) {
  const o = metrics.overall;
  const stage = (s) => ({ median: o.merged[s].median, p90: o.merged[s].p90 });
  const backlog = Object.fromEntries(
    Object.entries(o.backlog)
      .filter(([k]) => k !== 'n')
      .map(([state, v]) => [state, { count: v.count, medianWaitDays: v.waitingDays.median }])
  );
  const cross = metrics.groups['cross-cutting'];
  return {
    repo: metrics.repo,
    fetchedAt: metrics.fetchedAt,
    units: 'days',
    mergedWindow: metrics.window,
    merged: {
      prs: o.merged.n,
      firstResponse: stage('firstResponse'),
      review: stage('review'),
      approval: stage('approval'),
      mergeWait: stage('mergeWait'),
      cycle: stage('cycle'),
    },
    openBacklog: { prs: o.backlog.n, byState: backlog },
    bottlenecks: metrics.bottlenecks.slice(0, TOP_BOTTLENECKS).map((b) =>
      pick(b, ['rank', 'sig', 'state', 'count', 'medianWaitDays', 'prDays', 'examples'])
    ),
    crossCutting: cross ? { mergedPrs: cross.merged.n, openPrs: cross.backlog.n } : null,
  };
}

export function citablePrs(input) {
  return new Set(input.bottlenecks.flatMap((b) => b.examples));
}

const SYSTEM = `You write a short weekly risks brief for an engineering program manager about where pull requests wait in an open-source project.

Rules:
- Use only the facts in the JSON you are given. Do not add numbers, causes or context that are not in it.
- Write ${MIN_BULLETS} to ${MAX_BULLETS} bullets. Each bullet is one or two plain sentences that name a team (SIG) or stage, state the measured numbers, and say why it matters for delivery.
- Every bullet must cite 1 to 5 PR numbers taken from the "examples" lists in the input, in its "prs" array. Never cite any other PR.
- Talk about teams, stages and queues. Never name or describe individual people.
- Do not claim to know the project's internal priorities, staffing or intentions.
- State states plainly: "untouched" means no human response yet; "reviewer" means waiting for lgtm; "approver" means lgtm but not approved; "author" means the author's move; "merge-pending" means both gates met.
- Durations are in days. Write them like "85 days" or "1.7 hours".

Reply with JSON only, no prose and no code fences, in exactly this shape:
{"bullets":[{"text":"...","prs":[123456]}]}`;

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

/** Reject anything uncited, any citation not in the input, and any @mention. */
export function validateBrief(brief, allowed) {
  const errors = [];
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
    }
    for (const m of b.text.matchAll(/#(\d+)/g)) {
      if (!allowed.has(Number(m[1]))) errors.push(`bullet ${n} mentions #${m[1]}, which is not in the input`);
    }
    if (/(^|\s)@[A-Za-z0-9-]/.test(b.text)) errors.push(`bullet ${n} mentions a person (@handle)`);
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
