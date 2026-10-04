import { graphql } from './github.js';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_CAP = 1000;

const TIMELINE_TYPES =
  '[ISSUE_COMMENT, PULL_REQUEST_REVIEW, LABELED_EVENT, UNLABELED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]';

const TIMELINE_FIELDS = `
  pageInfo { hasNextPage endCursor }
  nodes {
    __typename
    ... on IssueComment { createdAt author { login __typename } }
    ... on PullRequestReview { submittedAt state author { login __typename } }
    ... on LabeledEvent { createdAt label { name } }
    ... on UnlabeledEvent { createdAt label { name } }
    ... on ReadyForReviewEvent { createdAt }
    ... on ConvertToDraftEvent { createdAt }
  }`;

// Search is used only to list PRs. Timelines nested inside search results come
// back incomplete (verified on #134037: 35 events via search vs 49 direct), so
// each timeline is fetched directly through repository.pullRequest.
const PR_FIELDS = `
  number title url createdAt mergedAt isDraft additions deletions
  author { login __typename }
  labels(first: 60) { nodes { name } }`;

const TIMELINE_BATCH_SIZE = 10;

const SEARCH_QUERY = `
  query($q: String!, $after: String, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { ${PR_FIELDS} } }
    }
    rateLimit { cost remaining }
  }`;

const TIMELINE_PAGE_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        timelineItems(first: 100, after: $after, itemTypes: ${TIMELINE_TYPES}) { ${TIMELINE_FIELDS} }
      }
    }
    rateLimit { cost remaining }
  }`;

const timelineBatchQuery = (numbers) => `
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      ${numbers
        .map((n) => `pr${n}: pullRequest(number: ${n}) { timelineItems(first: 100, itemTypes: ${TIMELINE_TYPES}) { ${TIMELINE_FIELDS} } }`)
        .join('\n')}
    }
    rateLimit { cost remaining }
  }`;

/** Compact one GraphQL timeline node into a small event record. */
export function normalizeEvent(node) {
  const actor = (a) => (a ? { login: a.login, bot: a.__typename === 'Bot' } : null);
  switch (node.__typename) {
    case 'IssueComment':
      return { type: 'comment', at: node.createdAt, actor: actor(node.author) };
    case 'PullRequestReview':
      return { type: 'review', at: node.submittedAt, state: node.state, actor: actor(node.author) };
    case 'LabeledEvent':
      return { type: 'labeled', at: node.createdAt, label: node.label.name };
    case 'UnlabeledEvent':
      return { type: 'unlabeled', at: node.createdAt, label: node.label.name };
    case 'ReadyForReviewEvent':
      return { type: 'ready', at: node.createdAt };
    case 'ConvertToDraftEvent':
      return { type: 'draft', at: node.createdAt };
    default:
      return null;
  }
}

export function normalizePr(node, timelineNodes) {
  const events = timelineNodes
    .map(normalizeEvent)
    .filter((e) => e && e.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    isDraft: node.isDraft,
    additions: node.additions,
    deletions: node.deletions,
    author: node.author ? { login: node.author.login, bot: node.author.__typename === 'Bot' } : null,
    labels: node.labels.nodes.map((l) => l.name),
    events,
  };
}

async function fetchRemainingTimeline(repo, number, cursor) {
  const extra = [];
  let after = cursor;
  while (after) {
    const data = await graphql(TIMELINE_PAGE_QUERY, { owner: repo.owner, name: repo.name, number, after });
    const page = data.repository.pullRequest.timelineItems;
    extra.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  }
  return extra;
}

/** Fetch full timelines for PR numbers, 10 per request, paginating long ones. */
async function fetchTimelines(repo, numbers) {
  const timelines = new Map();
  for (let i = 0; i < numbers.length; i += TIMELINE_BATCH_SIZE) {
    const batch = numbers.slice(i, i + TIMELINE_BATCH_SIZE);
    const data = await graphql(timelineBatchQuery(batch), { owner: repo.owner, name: repo.name });
    for (const n of batch) {
      const tl = data.repository[`pr${n}`].timelineItems;
      const extra = tl.pageInfo.hasNextPage ? await fetchRemainingTimeline(repo, n, tl.pageInfo.endCursor) : [];
      timelines.set(n, [...tl.nodes, ...extra]);
    }
  }
  return timelines;
}

/** Fetch every PR matching a search query that returns at most 1,000 results. */
async function fetchSearch(repo, q) {
  const nodes = [];
  let after = null;
  do {
    const data = await graphql(SEARCH_QUERY, { q, after, first: SEARCH_PAGE_SIZE });
    nodes.push(...data.search.nodes.filter((n) => n.number));
    after = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (after);
  const timelines = await fetchTimelines(repo, nodes.map((n) => n.number));
  return nodes.map((n) => normalizePr(n, timelines.get(n.number)));
}

async function countSearch(q) {
  const data = await graphql(SEARCH_QUERY, { q, after: null, first: 1 });
  return data.search.issueCount;
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * Fetch PRs whose `field` date falls in [from, to], splitting the range in half
 * whenever it holds more than search's 1,000-result cap.
 */
export async function fetchByDateRange(repo, baseQuery, field, from, to, log = () => {}) {
  const q = `repo:${repo.owner}/${repo.name} ${baseQuery} ${field}:${isoDay(from)}..${isoDay(to)}`;
  const count = await countSearch(q);
  if (count === 0) return [];
  if (count > SEARCH_CAP) {
    const spanDays = Math.round((to - from) / 86_400_000);
    if (spanDays < 1) throw new Error(`More than ${SEARCH_CAP} results in a single day: ${q}`);
    const mid = new Date(from.getTime() + Math.floor(spanDays / 2) * 86_400_000);
    const next = new Date(mid.getTime() + 86_400_000);
    const left = await fetchByDateRange(repo, baseQuery, field, from, mid, log);
    const right = await fetchByDateRange(repo, baseQuery, field, next, to, log);
    return [...left, ...right];
  }
  log(`  ${field} ${isoDay(from)}..${isoDay(to)}: ${count} PRs`);
  return fetchSearch(repo, q);
}

export function dedupe(prs) {
  return [...new Map(prs.map((p) => [p.number, p])).values()].sort((a, b) => a.number - b.number);
}
