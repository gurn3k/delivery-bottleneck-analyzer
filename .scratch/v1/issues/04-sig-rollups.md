# 04: SIG rollups and bottleneck ranking

Group merged and open PRs by SIG. Compute median and p90 per stage, backlog counts per state, and rank bottlenecks.

**Acceptance criteria**
- PRs with more than 3 SIGs go to `cross-cutting` (ADR 0007).
- Groups with n < 10 report `null` and are excluded from ranking.
- Rank by PR-days of waiting: PR count in the SIG and stage × median wait in that state. Ties broken by queue size.
- Each ranked bottleneck carries up to 5 example PR numbers (oldest first) for citation.
- Writes `site/data/metrics.json`.

*Ranking rule chosen by the product owner 2026-10-05: size × age.*
