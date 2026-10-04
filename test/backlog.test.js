import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, backlogEntry } from '../src/backlog.js';
import { pr, user, AUTHOR, labeled, comment, review } from './helpers.js';

const responded = [comment('2026-09-02T00:00:00Z', user('rev'))];
const state = (opts) => classify(pr(opts)).state;

test('draft and hold labels are on-hold', () => {
  assert.equal(state({ isDraft: true }), 'on-hold');
  assert.equal(state({ labels: ['do-not-merge/hold', 'needs-rebase'] }), 'on-hold');
  assert.equal(state({ labels: ['lifecycle/rotten'] }), 'on-hold');
});

test('author states: rebase, process labels, CLA, changes requested', () => {
  assert.equal(state({ labels: ['needs-rebase', 'lgtm'] }), 'author');
  assert.equal(state({ labels: ['do-not-merge/release-note-label-needed'] }), 'author');
  assert.equal(state({ labels: ['cncf-cla: no'] }), 'author');
  assert.equal(state({ events: [review('2026-09-02T00:00:00Z', user('rev'), 'CHANGES_REQUESTED')] }), 'author');
});

test('a later approval clears changes requested', () => {
  const events = [
    review('2026-09-02T00:00:00Z', user('rev'), 'CHANGES_REQUESTED'),
    review('2026-09-03T00:00:00Z', user('rev'), 'APPROVED'),
  ];
  assert.equal(state({ events }), 'reviewer');
});

test('untouched: only bots and the author have spoken', () => {
  const events = [comment('2026-09-02T00:00:00Z', { login: 'k8s-ci-robot', bot: false }), comment('2026-09-02T01:00:00Z', AUTHOR)];
  assert.equal(state({ events }), 'untouched');
});

test('reviewer, approver and merge-pending follow the gate labels', () => {
  assert.equal(state({ events: responded }), 'reviewer');
  assert.equal(state({ events: responded, labels: ['lgtm'] }), 'approver');
  assert.equal(state({ events: responded, labels: ['lgtm', 'approved'] }), 'merge-pending');
  assert.equal(state({ events: responded, labels: ['approved'] }), 'reviewer');
});

test('approver wait starts at the final lgtm', () => {
  const p = pr({
    createdAt: '2026-09-01T00:00:00Z',
    labels: ['lgtm'],
    events: [...responded, labeled('2026-09-10T00:00:00Z', 'lgtm')],
  });
  const e = backlogEntry(p, '2026-09-20T00:00:00Z');
  assert.equal(e.state, 'approver');
  assert.equal(e.ageDays, 19);
  assert.equal(e.waitingDays, 10);
});
