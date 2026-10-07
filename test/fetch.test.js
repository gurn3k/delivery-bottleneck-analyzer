import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchByDateRange, dedupe, normalizePr } from '../src/fetch-prs.js';
import { isBot } from '../src/bots.js';

// A real GraphQL response for kubernetes/kubernetes#140042, recorded 2026-10-07
// with the same PR and timeline fields the fetcher requests.
const recorded = JSON.parse(readFileSync('test/fixtures/pr-140042.json', 'utf8')).data.repository.pullRequest;
const { timelineItems: recordedTimeline, ...recordedPr } = recorded;

const REPO = { owner: 'kubernetes', name: 'kubernetes' };
const page = (nodes, cursor = null) => ({ pageInfo: { hasNextPage: cursor !== null, endCursor: cursor }, nodes });
const rateLimit = { cost: 1, remaining: 4999 };

/** A search-result PR node with no timeline, the shape search returns. */
const prNode = (number) => ({ ...recordedPr, number, url: `https://github.com/kubernetes/kubernetes/pull/${number}` });

/**
 * A fake GitHub GraphQL endpoint. `counts` maps a date range ("from..to") to its
 * issueCount; `prs` maps a range to its PR numbers; `timelines` maps a PR number
 * to its timeline pages. Every request is kept in `calls`.
 */
function fakeGitHub({ counts = {}, prs = {}, timelines = {}, searchPageSize = 100 }) {
  const calls = [];
  const rangeOf = (q) => q.match(/\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/)[0];
  globalThis.fetch = async (_url, { body }) => {
    const { query, variables } = JSON.parse(body);
    calls.push({ query, variables });
    let data;
    if (query.includes('search(')) {
      const range = rangeOf(variables.q);
      const numbers = prs[range] ?? [];
      const start = variables.after ? Number(variables.after) : 0;
      const size = variables.first === 1 ? 1 : searchPageSize;
      const slice = numbers.slice(start, start + size);
      const next = start + size < numbers.length ? String(start + size) : null;
      // Search can return non-PR nodes (an empty object); the fetcher must skip them.
      const nodes = [...slice.map(prNode), ...(start === 0 ? [{}] : [])];
      data = { search: { issueCount: counts[range] ?? numbers.length, pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes } };
    } else if (query.includes('$number')) {
      const pages = timelines[variables.number];
      const i = Number(variables.after);
      data = { repository: { pullRequest: { timelineItems: page(pages[i], i + 1 < pages.length ? String(i + 1) : null) } } };
    } else {
      const numbers = [...query.matchAll(/pr(\d+): pullRequest/g)].map((m) => Number(m[1]));
      const repository = {};
      for (const n of numbers) {
        const pages = timelines[n] ?? [recordedTimeline.nodes];
        repository[`pr${n}`] = { timelineItems: page(pages[0], pages.length > 1 ? '1' : null) };
      }
      data = { repository };
    }
    return new Response(JSON.stringify({ data: { ...data, rateLimit } }), { status: 200 });
  };
  return calls;
}

const realFetch = globalThis.fetch;
beforeEach(() => { process.env.GITHUB_TOKEN = 'test-token'; });
afterEach(() => { globalThis.fetch = realFetch; });

test('the recorded PR normalizes to 20 events in time order', () => {
  const pr = normalizePr(recordedPr, recordedTimeline.nodes);
  assert.equal(pr.number, 140042);
  assert.deepEqual(pr.author, { login: 'mdzraf', bot: false });
  assert.equal(pr.events.length, 20);
  assert.deepEqual(pr.events.map((e) => e.at), pr.events.map((e) => e.at).toSorted());
  const counts = Object.groupBy(pr.events, (e) => e.type);
  assert.equal(counts.labeled.length, 12);
  assert.equal(counts.unlabeled.length, 1);
  assert.equal(counts.comment.length, 6);
  assert.equal(counts.review.length, 1);
  assert.deepEqual(pr.events.find((e) => e.type === 'review').actor, { login: 'ConnorJC3', bot: false });
  assert.ok(pr.events.some((e) => e.type === 'labeled' && e.label === 'lgtm'));
});

test('bots are flagged by GraphQL type, and k8s-ci-robot by name', () => {
  const pr = normalizePr(recordedPr, recordedTimeline.nodes);
  const prow = pr.events.filter((e) => e.actor?.login === 'kubernetes-prow');
  assert.equal(prow.length, 3);
  assert.ok(prow.every((e) => e.actor.bot));
  // k8s-ci-robot is typed User by GitHub, so only the name list catches it.
  const ciRobot = normalizePr(recordedPr, [{ __typename: 'IssueComment', createdAt: '2026-09-01T00:00:00Z', author: { login: 'k8s-ci-robot', __typename: 'User' } }]);
  assert.equal(ciRobot.events[0].actor.bot, false);
  assert.ok(isBot(ciRobot.events[0].actor));
});

test('deleted accounts, unknown event types and undated events are handled', () => {
  const pr = normalizePr({ ...recordedPr, author: null }, [
    { __typename: 'IssueComment', createdAt: '2026-09-02T00:00:00Z', author: null },
    { __typename: 'PullRequestReview', submittedAt: null, state: 'PENDING', author: { login: 'rev', __typename: 'User' } },
    { __typename: 'SomethingNew', createdAt: '2026-09-01T00:00:00Z' },
  ]);
  assert.equal(pr.author, null);
  assert.deepEqual(pr.events, [{ type: 'comment', at: '2026-09-02T00:00:00Z', actor: null }]);
});

test('timelines are fetched directly, never taken from search results', async () => {
  const calls = fakeGitHub({ prs: { '2026-09-01..2026-09-30': [140042] } });
  const [pr] = await fetchByDateRange(REPO, 'is:pr is:merged', 'merged', new Date('2026-09-01'), new Date('2026-09-30'));
  assert.equal(pr.events.length, 20);
  const searches = calls.filter((c) => c.query.includes('search('));
  assert.ok(searches.length > 0);
  // Timelines nested in search come back incomplete (#134037: 35 events vs 49).
  assert.ok(searches.every((c) => !c.query.includes('timelineItems')));
});

test('search pages, timeline batches of 10 and long timelines are all followed', async () => {
  const numbers = Array.from({ length: 23 }, (_, i) => 1000 + i);
  const extra = { __typename: 'IssueComment', createdAt: '2026-09-30T00:00:00Z', author: { login: 'late-reviewer', __typename: 'User' } };
  const calls = fakeGitHub({
    prs: { '2026-09-01..2026-09-30': numbers },
    timelines: { 1005: [recordedTimeline.nodes, [extra]] },
    searchPageSize: 10,
  });
  const prs = await fetchByDateRange(REPO, 'is:pr is:open', 'created', new Date('2026-09-01'), new Date('2026-09-30'));
  assert.deepEqual(prs.map((p) => p.number), numbers);
  assert.equal(prs.find((p) => p.number === 1005).events.length, 21);
  assert.equal(prs.find((p) => p.number === 1005).events.at(-1).actor.login, 'late-reviewer');
  const batches = calls.filter((c) => /pr\d+: pullRequest/.test(c.query));
  assert.deepEqual(batches.map((c) => c.query.match(/pr\d+: pullRequest/g).length), [10, 10, 3]);
  assert.equal(calls.filter((c) => c.query.includes('$number')).length, 1);
});

test('a range over the 1,000-result cap is split into halves that do not overlap', async () => {
  const calls = fakeGitHub({
    counts: { '2026-09-01..2026-09-30': 1500 },
    prs: { '2026-09-01..2026-09-15': [1, 2], '2026-09-16..2026-09-30': [3] },
  });
  const prs = await fetchByDateRange(REPO, 'is:pr is:merged', 'merged', new Date('2026-09-01'), new Date('2026-09-30'));
  assert.deepEqual(prs.map((p) => p.number), [1, 2, 3]);
  const ranges = [...new Set(calls.filter((c) => c.query.includes('search(')).map((c) => c.variables.q.split(' ').at(-1)))];
  assert.deepEqual(ranges, ['merged:2026-09-01..2026-09-30', 'merged:2026-09-01..2026-09-15', 'merged:2026-09-16..2026-09-30']);
});

test('a single day over the cap stops with an error instead of dropping PRs', async () => {
  fakeGitHub({ counts: { '2026-09-01..2026-09-01': 1001 } });
  await assert.rejects(
    fetchByDateRange(REPO, 'is:pr is:open', 'created', new Date('2026-09-01'), new Date('2026-09-01')),
    /More than 1000 results in a single day/,
  );
});

test('dedupe keeps one copy of each PR, sorted by number', () => {
  assert.deepEqual(dedupe([{ number: 3 }, { number: 2 }, { number: 1 }, { number: 2 }]).map((p) => p.number), [1, 2, 3]);
});
