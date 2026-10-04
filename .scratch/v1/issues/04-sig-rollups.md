# 04: SIG rollups and bottleneck ranking

Group merged and open PRs by SIG. Compute median and p90 per stage, backlog counts per state, and rank bottlenecks.

**Acceptance criteria**
- PRs with more than 3 SIGs go to `cross-cutting` (ADR 0007).
- Groups with n < 10 report `null` and are excluded from ranking.
- Each ranked bottleneck carries up to 5 example PR numbers (oldest first) for citation.
- Writes `site/data/metrics.json`.
