import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, groupsOf, rankBottlenecks, rollup, CROSS_CUTTING, NO_SIG } from '../src/rollup.js';
import { pr, user, labeled, comment } from './helpers.js';

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const openRec = (number, sig, state, waitingDays) => ({ number, groups: [sig], state, waitingDays });

test('percentile uses nearest rank', () => {
  assert.equal(percentile(range(10), 50), 5);
  assert.equal(percentile(range(10), 90), 9);
  assert.equal(percentile([], 50), null);
});

test('groups under the minimum sample report null, not 0', () => {
  assert.deepEqual(summarize(range(9)), { n: 9, median: null, p90: null });
  assert.deepEqual(summarize(range(10)), { n: 10, median: 5, p90: 9 });
});

test('a PR counts toward each SIG, up to 3; more is cross-cutting', () => {
  assert.deepEqual(groupsOf(pr({ labels: ['sig/node', 'sig/apps', 'kind/bug'] })), ['apps', 'node']);
  assert.deepEqual(groupsOf(pr({ labels: ['sig/a', 'sig/b', 'sig/c'] })), ['a', 'b', 'c']);
  assert.deepEqual(groupsOf(pr({ labels: ['sig/a', 'sig/b', 'sig/c', 'sig/d'] })), [CROSS_CUTTING]);
  assert.deepEqual(groupsOf(pr({ labels: ['kind/bug'] })), [NO_SIG]);
});

test('bottlenecks rank by PR-days: size x median wait', () => {
  const records = [
    ...range(10).map((i) => openRec(i, 'node', 'reviewer', 30)), // 300 PR-days
    ...range(40).map((i) => openRec(100 + i, 'apps', 'approver', 10)), // 400 PR-days
  ];
  const ranked = rankBottlenecks(records);
  assert.deepEqual(ranked.map((b) => [b.rank, b.sig, b.state, b.prDays]), [
    [1, 'apps', 'approver', 400],
    [2, 'node', 'reviewer', 300],
  ]);
});

test('ties go to the bigger queue', () => {
  const records = [
    ...range(10).map((i) => openRec(i, 'node', 'reviewer', 20)), // 200
    ...range(20).map((i) => openRec(100 + i, 'apps', 'reviewer', 10)), // 200
  ];
  assert.deepEqual(rankBottlenecks(records).map((b) => b.sig), ['apps', 'node']);
});

test('small queues, on-hold, cross-cutting and no-sig are never ranked', () => {
  const records = [
    ...range(9).map((i) => openRec(i, 'node', 'reviewer', 99)),
    ...range(20).map((i) => openRec(100 + i, 'node', 'on-hold', 99)),
    ...range(20).map((i) => openRec(200 + i, CROSS_CUTTING, 'reviewer', 99)),
    ...range(20).map((i) => openRec(300 + i, NO_SIG, 'untouched', 99)),
  ];
  assert.deepEqual(rankBottlenecks(records), []);
});

test('each bottleneck cites up to 5 PRs, longest waiting first', () => {
  const records = range(12).map((i) => openRec(i, 'node', 'reviewer', i));
  assert.deepEqual(rankBottlenecks(records)[0].examples, [12, 11, 10, 9, 8]);
});

test('rollup groups merged and open PRs and converts hours to days', () => {
  const merged = range(10).map((i) => ({
    ...pr({
      labels: ['sig/node'],
      createdAt: '2026-09-01T00:00:00Z',
      mergedAt: '2026-09-03T00:00:00Z',
      events: [labeled('2026-09-02T00:00:00Z', 'lgtm'), labeled('2026-09-02T00:00:00Z', 'approved')],
    }),
    number: i,
  }));
  const open = [{ ...pr({ labels: ['sig/node'], events: [comment('2026-09-02T00:00:00Z', user('rev'))] }), number: 99, title: 't' }];
  const r = rollup({ merged, open, now: '2026-09-11T00:00:00Z' });
  assert.equal(r.groups.node.merged.cycle.median, 2);
  assert.equal(r.groups.node.merged.mergeWait.median, 1);
  assert.equal(r.groups.node.backlog.reviewer.count, 1);
  assert.equal(r.groups.node.backlog.reviewer.waitingDays.median, null);
  assert.equal(r.prs.open[0].waitingDays, 10);
});
