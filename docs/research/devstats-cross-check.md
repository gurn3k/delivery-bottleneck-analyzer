# Cross-check against DevStats

Run 2026-10-06 with `node scripts/cross-check-devstats.js 2026-08 2026-09`. It compares DevStats' "PR Time to Approve and Merge" for `kubernetes/kubernetes` (monthly, all sizes and kinds, read from its public Grafana API) with **DevStats' own definitions recomputed on this project's data**, so like is compared with like.

DevStats' definitions, from [`metrics/kubernetes/time_metrics.sql`](https://github.com/cncf/devstats/blob/master/metrics/kubernetes/time_metrics.sql): merged PRs grouped by the month they were **created**, clock starting at **open**, the **first** `lgtm` and `approved` label adds, missing stages falling back to the next event or to zero, and `percentile_disc` (nearest rank) median and 85th percentile.

## Cohorts are complete

PRs created in each month and merged, counted with GitHub search on 2026-10-06:

| Created | Merged PRs on GitHub | In our data | Merged after our fetch |
|---|---|---|---|
| 2026-08 | 198 | 198 | 0 |
| 2026-09 | 265 | 263 | 2 |

July is left out: our data starts with merges on 2026-07-06, so July's cohort is missing its fastest PRs.

## Results

| Stage | Aug: DevStats | Aug: ours | Sep: DevStats | Sep: ours |
|---|---|---|---|---|
| open → lgtm, median | 8.9 d | 6.4 d | 32.3 h | 27.0 h |
| open → lgtm, 85th | 28.3 d | 27.8 d | 6.5 d | 5.9 d |
| lgtm → approve, median | 0 h | 0 h | 0 h | 0 h |
| lgtm → approve, 85th | 2.7 d | 7.9 d | 0 h | 4.7 h |
| approve → merge, median | 2.6 h | 3.5 h | 3.8 h | 2.5 h |
| approve → merge, 85th | 10.1 d | 13.0 d | 24.0 h | 30.5 h |

## What agrees

- **The main finding.** In both datasets nearly all the time is in getting to lgtm, and merging after approval takes hours at the median. This is the finding the dashboard and brief lead with.
- **Scale and month-to-month change.** Both show August PRs taking several times longer to reach lgtm than September PRs (DevStats 8.9 d vs 32 h; ours 6.4 d vs 27 h). The slowdown shows up independently in both sources. *Why August was slower isn't in either dataset.*
- **The 85th percentile time to lgtm** is within 10% in both months.

## What differs, and the likely reasons

- **Our median time to lgtm is 16-28% lower.** One plausible reason is DevStats' documented data gap: its GH Archive source is missing events, and when a PR's `lgtm` label event is missing, its SQL falls back to the approve or merge time, which makes time to lgtm longer. *This is an explanation, not a measurement. We can't see which events DevStats is missing.*
- **Our lgtm → approve and approve → merge tails are longer.** Same possible cause in the other direction: a missing label event in DevStats would collapse a stage to zero or move time into another stage.
- **We can't compare PR counts.** DevStats' series doesn't publish how many PRs each month's figure covers.

## What this means for the README

- Reasonable to say: "The main finding agrees with Kubernetes' own DevStats: most of a merged PR's time is spent waiting for lgtm, and merging after approval takes hours."
- Not supportable: "more accurate than DevStats." The two disagree by up to 28% on the median, and we can't tell which is closer to the truth without the missing-event data.
- Draft time made no difference in these cohorts (median and 85th percentile 0 h between opening and ready for review), so the clock-start difference doesn't explain the gap.
