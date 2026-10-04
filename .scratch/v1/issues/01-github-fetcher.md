# 01: GitHub fetcher

Fetch merged PRs (last N days, default 90) and all open PRs from `kubernetes/kubernetes` via GraphQL, including labels, label add/remove events, ready-for-review events, comments and reviews (with actor type).

**Acceptance criteria**
- Uses `GITHUB_TOKEN`; fails with a clear message if it's missing.
- Works around GitHub search's 1,000-result cap by splitting date ranges.
- Paginates timelines over 100 items, so no PR is silently truncated.
- Prints the rate-limit cost used. A full run stays well under 5,000 points.
- Writes `data/raw/{merged,open}.json` with a `fetchedAt` timestamp.
