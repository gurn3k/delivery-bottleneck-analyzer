// Ground truth for the risks brief. Everything here is computed from metrics.json,
// never typed in by hand, so it stays true when the data changes.
//
// - allowedNumbers: every number the brief may state (the numbers in its input facts).
// - buildTraps: tempting wrong readings of the data, each with the evidence against it.
// - keyFindings: what a good brief should cover, for scoring (not for blocking).

import { humanDays, buildComparisons, numbersIn } from './brief.js';

export { numbersIn };

/** The set of numbers the model was given. A brief may state only these. */
export function allowedNumbers(input) {
  return new Set(input.facts.flatMap((f) => numbersIn(f.fact)));
}

// A gap of up to n characters within one clause that contains no negation, so
// "the merge queue is not the bottleneck" does not read as "the merge queue is the bottleneck".
const gap = (n) => `(?:(?!\\b(?:not|never|no)\\b|n't)[^.;]){0,${n}}`;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pct = (part, whole) => Math.round((part / whole) * 100);

/**
 * Known-false or unsupported claims. `block: true` traps reject a brief; the
 * pattern is written to match the claim, not the topic, so a correct sentence
 * about the same stage passes.
 */
export function buildTraps(metrics) {
  const m = metrics.overall.merged;
  const b = metrics.overall.backlog;
  const traps = [
    {
      id: 'merge-is-slow',
      claim: 'The merge queue, CI or the merge step is slow or the bottleneck.',
      evidence: `Once both review labels are set, the median PR merges in ${humanDays(m.mergeWait.median)}. The slow stage is review: the slowest 10% took over ${humanDays(m.review.p90)} to get lgtm.`,
      pattern: new RegExp(
        `\\b(merge queue|merging|merge step|merge stage|CI)\\b${gap(60)}\\b(slow|lengthy|long|bottleneck|delay\\w*)\\b` +
          `|\\b(slow|lengthy|bottleneck\\w*)\\b${gap(40)}\\b(merge queue|merging|merge step|CI)\\b`,
        'i'
      ),
      block: true,
    },
    {
      id: 'approvers-are-the-bottleneck',
      claim: 'Approvers are the main bottleneck.',
      evidence: `${b.approver.count} open PRs wait for an approver, against ${b.reviewer.count} waiting for a reviewer's lgtm and ${b.untouched.count} with no response at all.`,
      pattern: new RegExp(
        `\\bapprov\\w*${gap(40)}\\b(main|biggest|largest|primary|key)\\s+(bottleneck|constraint|delay)` +
          `|\\b(main|biggest|largest|primary)\\s+(bottleneck|constraint)${gap(30)}\\bapprov`,
        'i'
      ),
      block: true,
    },
    {
      id: 'causes',
      claim: 'A cause for the waiting (staffing, volunteers, priorities, neglect).',
      evidence: 'The data records where PRs wait and for how long. It says nothing about why.',
      pattern: /\b(understaff\w*|short-staffed|staffing|volunteer\w*|burnout|morale|workload|capacity|lack of (reviewers|maintainers|attention)|priorit\w*|neglect\w*|ignor\w*)\b/i,
      block: true,
    },
    {
      id: 'consequences',
      claim: 'An effect of the waiting (releases, downstream work, delivery, deadlines).',
      evidence: 'Nothing in the data measures releases, downstream work or delivery dates.',
      pattern: /\b(releases?|downstream|deadlines?|roadmap|(stall|block)\w*\s+(downstream|releases?|work|delivery|progress)|delay\w*\s+delivery|slow\w*\s+(merges|delivery))\b/i,
      block: true,
    },
    {
      id: 'internal-labels',
      claim: "Classifier jargon instead of plain words (\"reviewer state\", \"global queue\").",
      evidence: 'Readers know queues by what they wait for, not by internal state names.',
      pattern: /\b(global queue|untouched (stage|state|queue)|(reviewer|approver|author|merge-pending|on-hold)[- ]state|merge-pending)\b/i,
      block: true,
    },
  ];
  // Reading a p90 as the typical case: "median ... 49 days" when 49 days is the p90.
  for (const [stage, label] of [['review', 'review'], ['cycle', 'cycle time']]) {
    const p90 = humanDays(m[stage].p90);
    if (!p90) continue;
    traps.push({
      id: `p90-as-typical-${stage}`,
      claim: `The ${label} p90 (${p90}) described as the median or typical case.`,
      evidence: `The median ${label} is ${humanDays(m[stage].median)}; ${p90} is what the slowest 10% exceed.`,
      pattern: new RegExp(`\\b(median|typical\\w*|average|most PRs)\\W+(?:\\w+\\W+){0,3}${escape(p90)}`, 'i'),
      block: true,
    });
  }
  return traps;
}

export const findTraps = (text, traps) => traps.filter((t) => t.pattern.test(text));

/** What a strong brief covers. Each finding is covered when all its markers appear. */
export function keyFindings(metrics) {
  const m = metrics.overall.merged;
  const b = metrics.overall.backlog;
  const findings = [
    {
      id: 'review-not-merge',
      finding: 'Review is the slow stage; merging is fast once approved.',
      markers: [humanDays(m.review.p90), humanDays(m.mergeWait.median)],
    },
    {
      id: 'untouched-share',
      finding: 'About a fifth of open PRs have had no human response.',
      markers: [`${pct(b.untouched.count, b.n)}%`],
    },
    {
      id: 'author-vs-reviewer',
      finding: "The author's move is about as common as the reviewer's.",
      markers: [b.author.count.toLocaleString('en-US'), b.reviewer.count.toLocaleString('en-US')],
    },
  ];
  const top = metrics.bottlenecks[0];
  if (top) {
    findings.push({
      id: 'top-queue',
      finding: `The biggest queue is sig/${top.sig}.`,
      markers: [`sig/${top.sig}`, humanDays(top.medianWaitDays)],
    });
  }
  const share = buildComparisons(metrics).find((c) => /are labeled sig\//.test(c.fact));
  const shareMarker = share?.fact.match(/\((\d+%)\)/)?.[1];
  if (shareMarker) {
    findings.push({ id: 'two-sig-share', finding: 'Two SIGs hold most of the review queue.', markers: [shareMarker] });
  }
  return findings.filter((f) => f.markers.every(Boolean));
}

export function coverage(bullets, findings) {
  const text = bullets.map((b) => b.text).join(' ');
  return findings.map((f) => ({ ...f, covered: f.markers.every((mk) => text.includes(mk)) }));
}
