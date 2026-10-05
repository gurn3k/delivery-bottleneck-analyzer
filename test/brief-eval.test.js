import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInput, citationGroups, validateBrief } from '../src/brief.js';
import { allowedNumbers, buildTraps, findTraps, keyFindings, coverage } from '../src/brief-checks.js';

// Ground truth is computed from the committed snapshot, the same file the dashboard reads.
const metrics = JSON.parse(readFileSync('site/data/metrics.json', 'utf8'));
const input = buildInput(metrics);
const groups = citationGroups(input);
const checks = { numbers: allowedNumbers(input), traps: buildTraps(metrics) };
const run = (n) => JSON.parse(readFileSync(`eval/brief/history/run-${n}.json`, 'utf8'));
const errorsFor = (brief) => validateBrief(brief, groups, checks).errors;
const trapIds = (text) => findTraps(text, checks.traps).map((t) => t.id);

test('every input fact passes the number and trap checks', () => {
  for (const f of input.facts) {
    assert.deepEqual(trapIds(f.fact), [], f.fact);
    assert.deepEqual(errorsFor({ bullets: [{ text: f.fact, prs: f.examples.slice(0, 1) }] }).filter((e) => !/expected/.test(e)), [], f.fact);
  }
});

test('run 1 is rejected for invented decimals, speculation and jargon', () => {
  const errors = errorsFor(run(1));
  assert.ok(errors.some((e) => /states 84.98/.test(e)));
  assert.ok(errors.some((e) => /\(consequences\)/.test(e)));
  assert.ok(errors.some((e) => /\(internal-labels\)/.test(e)));
});

test('run 2 is rejected for "global queue" labels', () => {
  assert.ok(errorsFor(run(2)).some((e) => /bullet 1 .*\(internal-labels\)/.test(e)));
});

test('run 3 is rejected for leaked field names, and its first three bullets pass', () => {
  assert.ok(errorsFor(run(3)).some((e) => /medianWait/.test(e)));
  const good = run(3).bullets.slice(0, 3);
  assert.deepEqual(errorsFor({ bullets: good }).filter((e) => !/expected/.test(e)), []);
});

test('run 6 is rejected for blaming the merge queue, with the evidence', () => {
  const errors = errorsFor(run(6));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bullet 1 .*\(merge-is-slow\).*1\.7 hours/);
});

test('traps match the claim, not the topic, and respect negation', () => {
  assert.deepEqual(trapIds('The merge queue can be lengthy for outliers.'), ['merge-is-slow']);
  assert.deepEqual(trapIds('The merge queue is not the bottleneck; review is.'), []);
  assert.deepEqual(trapIds('Once both labels are set, the median PR merged in 1.7 hours.'), []);
  assert.deepEqual(trapIds('Approvers are the main bottleneck.'), ['approvers-are-the-bottleneck']);
  assert.deepEqual(trapIds('Reviewers are understaffed.'), ['causes']);
  assert.deepEqual(trapIds('The median review takes 49 days.'), ['p90-as-typical-review']);
  assert.deepEqual(trapIds('Review takes a median 4.1 days, but the slowest 10% took over 49 days.'), []);
});

test('a number not in the facts is rejected; 240 is the double-counted SIG total', () => {
  const brief = { bullets: [{ text: 'sig/api-machinery and sig/node hold 240 PRs waiting for review.', prs: [118378] }] };
  assert.ok(errorsFor(brief).some((e) => /states 240/.test(e)));
});

test('coverage credits a finding only when all its markers appear', () => {
  const cov = coverage(run(3).bullets, keyFindings(metrics));
  assert.ok(cov.find((c) => c.id === 'review-not-merge').covered);
  assert.equal(cov.find((c) => c.id === 'author-vs-reviewer').covered, false);
});

test('describing PRs as stalled is not a consequence claim; stalling other work is', () => {
  // Rejected by an earlier, broader pattern in the first attempt of the 2026-10-05 eval run.
  const accurate = 'Most of the PRs stalled awaiting a reviewer are concentrated in two teams: 231 of the 368 waiting for a reviewer\u2019s lgtm are labeled sig/api-machinery or sig/node.';
  assert.deepEqual(trapIds(accurate), []);
  assert.deepEqual(trapIds('These PRs can stall downstream work.'), ['consequences']);
});
