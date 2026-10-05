import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBrief, parseBrief, estimateCost, cleanBullets, humanDays, buildComparisons, MAX_OUTPUT_TOKENS } from '../src/brief.js';

const allowed = [[101, 102, 105], [103, 104]];
const bullet = (prs, text = 'sig/node reviewer queue: 120 PRs waiting a median 75 days.') => ({ text, prs });
const brief = (...bullets) => ({ bullets });
const four = (b) => brief(b, bullet([102]), bullet([103]), bullet([104]));

test('a fully cited brief passes', () => {
  assert.deepEqual(validateBrief(four(bullet([101, 105])), allowed), { ok: true, errors: [] });
});

test('an uncited bullet is rejected', () => {
  const r = validateBrief(four(bullet([])), allowed);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /cites no PRs/);
  assert.equal(validateBrief(four({ text: 'no prs field' }), allowed).ok, false);
});

test('a citation not in the input is rejected', () => {
  const r = validateBrief(four(bullet([101, 999])), allowed);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /#999, which is not in the input/);
});

test('a PR number in the text that is not in the input is rejected', () => {
  const r = validateBrief(four(bullet([101], 'See #101 and #555.')), allowed);
  assert.deepEqual(r.errors, ['bullet 1 mentions #555, which is not in the input']);
});

test('non-integer citations are rejected', () => {
  assert.equal(validateBrief(four(bullet(['101'])), allowed).ok, false);
});

test('too few or too many bullets are rejected', () => {
  assert.equal(validateBrief(brief(bullet([101])), allowed).ok, false);
  assert.equal(validateBrief(brief(...Array(7).fill(bullet([101]))), allowed).ok, false);
  assert.equal(validateBrief({}, allowed).ok, false);
});

test('mentioning a person by handle is rejected', () => {
  assert.equal(validateBrief(four(bullet([101], 'Waiting on @someone for weeks.')), allowed).ok, false);
});

test('parseBrief tolerates code fences and stray prose', () => {
  assert.deepEqual(parseBrief('Here you go:\n```json\n{"bullets":[]}\n```'), { bullets: [] });
  assert.throws(() => parseBrief('no json here'), /no JSON/);
});

test('cleanBullets trims text and drops duplicate citations', () => {
  assert.deepEqual(cleanBullets([{ text: ' x ', prs: [1, 1, 2] }]), [{ text: 'x', prs: [1, 2] }]);
});

test('cost estimate charges the full output budget', () => {
  const est = estimateCost([{ content: 'x'.repeat(3000) }], { prompt: '0.000001', completion: '0.000002' });
  assert.equal(est.inputTokens, 1000);
  assert.equal(est.usd, 1000 * 0.000001 + MAX_OUTPUT_TOKENS * 0.000002);
});

test('citations mixed from different queues are rejected', () => {
  const r = validateBrief(four(bullet([101, 103])), allowed);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /mixes citations from different queues/);
});

test('banned template phrases are rejected', () => {
  const r = validateBrief(four(bullet([101], 'Slow, which matters because it is slow.')), allowed);
  assert.deepEqual(r.errors, ['bullet 1 uses "which matters because"']);
});

test('durations are pre-rounded for the model', () => {
  assert.equal(humanDays(84.98), '85 days');
  assert.equal(humanDays(4.07), '4.1 days');
  assert.equal(humanDays(0.07), '1.7 hours');
  assert.equal(humanDays(null), null);
});

test('team share counts a PR labeled with both SIGs once', () => {
  const rec = (number, groups) => ({ number, groups, state: 'reviewer', waitingDays: number });
  const stats = { median: null, p90: null };
  const metrics = {
    overall: { merged: { review: stats, mergeWait: stats }, backlog: { author: { count: 0 }, reviewer: { count: 4 } } },
    bottlenecks: [{ sig: 'a', state: 'reviewer' }, { sig: 'b', state: 'reviewer' }],
    prs: { merged: [], open: [rec(1, ['a', 'b']), rec(2, ['a']), rec(3, ['b']), rec(4, ['c'])] },
  };
  const [share] = buildComparisons(metrics);
  assert.match(share.fact, /^3 of the 4 PRs waiting/);
  assert.deepEqual(share.examples, [3, 2, 1]);
});

test('internal field names in the text are rejected', () => {
  const r = validateBrief(four(bullet([101], 'sig/node has 112 PRs with a medianWait of 41 days.')), allowed);
  assert.deepEqual(r.errors, ['bullet 1 uses the field name "medianWait"; write it in plain words']);
  assert.equal(validateBrief(four(bullet([101], 'sig/api-machinery waits 85 days for lgtm.')), allowed).ok, true);
});
