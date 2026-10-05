import { stageDurations } from './stages.js';
import { backlogEntry, STATES } from './backlog.js';
import { MIN_SAMPLE, CROSS_CUTTING_SIG_COUNT } from './config.js';

export const STAGES = ['firstResponse', 'review', 'approval', 'mergeWait', 'cycle'];
export const CROSS_CUTTING = 'cross-cutting';
export const NO_SIG = 'no-sig';

// On-hold PRs are parked on purpose (drafts, holds, rotten), so they are counted
// but never ranked as a bottleneck.
export const RANKED_STATES = STATES.filter((s) => s !== 'on-hold');

const EXAMPLES_PER_BOTTLENECK = 5;
const round = (x) => (x === null ? null : Math.round(x * 100) / 100);

/** Nearest-rank percentile of a numeric array. Null for an empty array. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Median and p90 in days, or nulls when the sample is under the minimum. */
export function summarize(values) {
  const n = values.length;
  if (n < MIN_SAMPLE) return { n, median: null, p90: null };
  return { n, median: round(percentile(values, 50)), p90: round(percentile(values, 90)) };
}

/** The groups a PR counts toward: each SIG, or cross-cutting / no-sig. */
export function groupsOf(pr) {
  const sigs = pr.labels.filter((l) => l.startsWith('sig/')).map((l) => l.slice(4));
  if (sigs.length === 0) return [NO_SIG];
  if (sigs.length > CROSS_CUTTING_SIG_COUNT) return [CROSS_CUTTING];
  return sigs.sort();
}

export function mergedRecord(pr) {
  const hours = stageDurations(pr);
  const days = Object.fromEntries(STAGES.map((s) => [s, hours[s] === null ? null : round(hours[s] / 24)]));
  return { number: pr.number, groups: groupsOf(pr), ...days };
}

export function openRecord(pr, now) {
  const e = backlogEntry(pr, now);
  return {
    number: pr.number,
    title: pr.title,
    groups: groupsOf(pr),
    state: e.state,
    ...(e.reason ? { reason: e.reason } : {}),
    ageDays: round(e.ageDays),
    waitingDays: round(e.waitingDays),
  };
}

export function mergedStats(records) {
  return {
    n: records.length,
    ...Object.fromEntries(STAGES.map((s) => [s, summarize(records.map((r) => r[s]).filter((v) => v !== null))])),
  };
}

export function backlogStats(records) {
  const byState = Object.fromEntries(
    STATES.map((state) => {
      const inState = records.filter((r) => r.state === state);
      return [state, { count: inState.length, waitingDays: summarize(inState.map((r) => r.waitingDays)) }];
    })
  );
  return { n: records.length, ...byState };
}

const longestWaitingFirst = (a, b) => b.waitingDays - a.waitingDays || a.number - b.number;

/**
 * Rank SIG x state queues by PR-days of waiting: queue size times median wait.
 * Cross-cutting and no-sig are reported separately and never ranked, and so are
 * queues under the minimum sample.
 */
export function rankBottlenecks(openRecords) {
  const queues = new Map();
  for (const r of openRecords) {
    if (!RANKED_STATES.includes(r.state)) continue;
    for (const g of r.groups) {
      if (g === CROSS_CUTTING || g === NO_SIG) continue;
      const key = `${g}|${r.state}`;
      if (!queues.has(key)) queues.set(key, { sig: g, state: r.state, prs: [] });
      queues.get(key).prs.push(r);
    }
  }
  return [...queues.values()]
    .filter((q) => q.prs.length >= MIN_SAMPLE)
    .map((q) => {
      const median = percentile(q.prs.map((r) => r.waitingDays), 50);
      return {
        sig: q.sig,
        state: q.state,
        count: q.prs.length,
        medianWaitDays: round(median),
        prDays: Math.round(q.prs.length * median),
        examples: [...q.prs].sort(longestWaitingFirst).slice(0, EXAMPLES_PER_BOTTLENECK).map((r) => r.number),
      };
    })
    .sort((a, b) => b.prDays - a.prDays || b.count - a.count)
    .map((b, i) => ({ rank: i + 1, ...b }));
}

/** Full rollup: overall, per group, and the ranked bottlenecks, with PR records for drill-down. */
export function rollup({ merged, open, now }) {
  const mergedRecords = merged.map(mergedRecord);
  const openRecords = open.map((pr) => openRecord(pr, now));
  const names = [...new Set([...mergedRecords, ...openRecords].flatMap((r) => r.groups))].sort();
  const groups = Object.fromEntries(
    names.map((g) => [
      g,
      {
        merged: mergedStats(mergedRecords.filter((r) => r.groups.includes(g))),
        backlog: backlogStats(openRecords.filter((r) => r.groups.includes(g))),
      },
    ])
  );
  return {
    overall: { merged: mergedStats(mergedRecords), backlog: backlogStats(openRecords) },
    groups,
    bottlenecks: rankBottlenecks(openRecords),
    prs: { merged: mergedRecords, open: openRecords },
  };
}
