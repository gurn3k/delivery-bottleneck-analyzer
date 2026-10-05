import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBrief, parseBrief, estimateCost, cleanBullets, MAX_OUTPUT_TOKENS } from '../src/brief.js';

const allowed = new Set([101, 102, 103, 104, 105]);
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
