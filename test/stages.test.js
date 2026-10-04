import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageDurations, readyTime, finalLabelAdd } from '../src/stages.js';
import { pr, user, AUTHOR, labeled, unlabeled, comment, review } from './helpers.js';

const D = (day, hour = 0) => `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;

test('happy path: each stage measured from ready time', () => {
  const p = pr({
    createdAt: D(1),
    mergedAt: D(4),
    events: [comment(D(1, 6), user('rev')), labeled(D(2), 'lgtm'), labeled(D(3), 'approved')],
  });
  assert.deepEqual(stageDurations(p), { firstResponse: 6, review: 24, approval: 48, mergeWait: 24, cycle: 72 });
});

test('bots and the author never count as first response', () => {
  const p = pr({
    mergedAt: D(5),
    events: [
      comment(D(1, 1), { login: 'k8s-ci-robot', bot: false }),
      comment(D(1, 2), { login: 'kubernetes-prow', bot: true }),
      comment(D(1, 3), AUTHOR),
      review(D(1, 10), user('rev')),
    ],
  });
  assert.equal(stageDurations(p).firstResponse, 10);
});

test('draft time is excluded: the clock starts at the last ready event', () => {
  const p = pr({
    createdAt: D(1),
    mergedAt: D(10),
    events: [{ type: 'ready', at: D(5) }, comment(D(5, 2), user('rev'))],
  });
  assert.equal(readyTime(p), D(5));
  assert.equal(stageDurations(p).firstResponse, 2);
  assert.equal(stageDurations(p).cycle, 120);
});

test('a reviewer who engaged during the draft means zero response wait', () => {
  const p = pr({ createdAt: D(1), mergedAt: D(10), events: [comment(D(2), user('rev')), { type: 'ready', at: D(5) }] });
  assert.equal(stageDurations(p).firstResponse, 0);
});

test('lgtm removed by a new push uses the final add', () => {
  const p = pr({
    mergedAt: D(9),
    events: [labeled(D(2), 'lgtm'), unlabeled(D(3), 'lgtm'), labeled(D(6), 'lgtm'), labeled(D(7), 'approved')],
  });
  assert.equal(finalLabelAdd(p, 'lgtm', p.mergedAt), D(6));
  assert.equal(stageDurations(p).review, 5 * 24);
});

test('self-approved PR: approved before lgtm, merge wait counts from the later gate', () => {
  const p = pr({ mergedAt: D(5), events: [labeled(D(1, 1), 'approved'), labeled(D(4), 'lgtm')] });
  const s = stageDurations(p);
  assert.equal(s.approval, 1);
  assert.equal(s.mergeWait, 24);
});

test('missing stages are null, never 0', () => {
  const p = pr({ mergedAt: D(3), labels: ['lgtm', 'approved'], events: [] });
  const s = stageDurations(p);
  assert.equal(s.firstResponse, null);
  assert.equal(s.review, null);
  assert.equal(s.approval, null);
  assert.equal(s.mergeWait, null);
  assert.equal(s.cycle, 48);
});

test('label events after the merge are ignored', () => {
  const p = pr({ mergedAt: D(3), events: [labeled(D(2), 'lgtm'), unlabeled(D(4), 'lgtm')] });
  assert.equal(finalLabelAdd(p, 'lgtm', p.mergedAt), D(2));
});
