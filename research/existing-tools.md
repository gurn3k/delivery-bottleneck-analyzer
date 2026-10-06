# Existing tools: what already measures PR flow, and what this project adds

Researched 2026-10-06 for self-review step 2. DevStats was read from its live dashboard API and its documentation in `cncf/devstats`. Other tools come from their own docs or press coverage, as cited.

## 1. Kubernetes DevStats (CNCF): the closest overlap

[k8s.devstats.cncf.io](https://k8s.devstats.cncf.io) has 46 Grafana dashboards. Its "PR velocity" folder holds 18, several of which overlap this project directly ([docs](https://github.com/cncf/devstats/tree/master/docs/dashboards/kubernetes)):

| DevStats dashboard | What it measures (from its docs) | Overlap with this project |
|---|---|---|
| PR Time to Approve and Merge | Median and 85th percentile time for merged PRs, open → lgtm → approve → merge, stacked. Filters for size, kind and API change. | High: our stage metrics |
| PR Time to Engagement | Median, 15th and 85th percentile time from creation to first non-author activity. Skips bots. | High: our first response |
| Awaiting PRs by SIG | Open PRs per SIG older than 10, 30, 60 or 90 days, or 1 year, over time | Medium: our backlog age by SIG |
| Inactive PRs by SIG | Open PRs per SIG with no non-author, non-bot activity for 14, 30 or 90+ days | Medium: close to our "no human response" queue |
| Blocked PRs | PRs blocked by missing `approved` or `lgtm`, `release-note-label-needed`, `needs-ok-to-test` or `do-not-merge*`, by repository group | Medium: close to our whose-move states |
| PR Workload per SIG | Open PRs per SIG weighted by size label, and that workload divided by the number of the SIG's reviewers | Low: **reviewer capacity, which this project doesn't measure** |
| PRs approval | Approved versus awaiting-approval PRs over time | Low |

**Where DevStats differs from this project, from its own docs:**

- **Data source.** DevStats reads the public GH Archive event stream, and every dashboard carries a warning that GH Archive "is missing a significant number of GitHub events (notably in recent months), so contributions data shown here is undercounted" ([cncf/devstats#147](https://github.com/cncf/devstats/issues/147)). This project reads each PR's timeline directly from GitHub's GraphQL API. *We haven't compared the two datasets, so we can't claim ours is more accurate, only that it comes from a different, direct source.*
- **Clock start.** DevStats times from when a PR was opened, so time spent as a draft counts. This project times from when the PR became ready for review.
- **Stage conventions.** In DevStats, merging without labels counts as lgtm and approve, and missing stages count as zero. This project uses the final label adds and leaves missing stages empty.
- **Percentiles.** DevStats uses 85th; this project uses 90th.
- **Shape.** DevStats is time series by period (week, month, release) across 46 dashboards. This project is one snapshot page.
- **Categories.** DevStats's blocked, awaiting and inactive counts are separate views that can overlap. This project puts each open PR in exactly one state, by precedence.

## 2. Commercial engineering-metrics products

- **Swarmia** splits PR cycle time into time in progress (first commit or opened → first review request), time in review (first review request → final approval) and time to merge (final approval → merged). It also reports time to first review ([Swarmia docs](https://help.swarmia.com/metrics-and-definitions/pull-request-cycle-time)).
- **LinearB** splits cycle time into coding, pickup (waiting before a review starts), review and deploy, and sends alerts on waiting work ([LinearB](https://linearb.io/blog/cycle-time-measuring-and-improving-team-process)).
- **Sweetr** (April 2026) shows cycle time broken into coding, first review, approval and merge ([changelog](https://sweetr.featurebase.app/en/changelog/pull-request-flow-and-code-review-efficiency)).
- **Metabase** publishes a "code review health" dashboard template showing where PRs wait, from open to first review to merge ([Metabase](https://www.metabase.com/dashboards/code-review-health)).

These are built for a company's own repositories, with paid seats and an install. Stage splits like this project's are standard in the category. *I didn't verify whether any of them assigns open PRs to a single whose-move state or ranks team queues.*

## 3. GitHub's own pull request dashboard

GitHub's redesigned pull requests page reached general availability on 2026-07-13. Its Inbox shows **one person** the PRs that need their attention: review requests (personal and team), PRs needing fixes after CI failures or comments, and PRs ready to merge or in the merge queue ([devops.com](https://devops.com/githubs-redesigned-pr-inbox-tackles-the-review-bottleneck-ai-created/)). It has no queue analytics. As that coverage puts it, "a better inbox just makes the queue easier to see — it doesn't make it shorter."

## 4. CHAOSS (open-source health metrics)

CHAOSS defines standard metrics for open-source responsiveness: change request duration, review duration, and review cycle duration within a change request ([CHAOSS](https://chaoss.community/metric-change-requests-duration/)). They're definitions, not a tool. This project's first-response and cycle-time metrics map onto them.

## What this project adds

All of these are checkable against the sections above:

1. **One whose-move view.** Every open PR is in exactly one state (no response, reviewer, approver, merge, author, on hold), with how long it has waited *in that state*. DevStats has the pieces in separate, overlapping dashboards. GitHub's Inbox does this per person, not per team.
2. **A single ranked list across team and stage,** by PR-days of waiting. DevStats and GitHub don't rank queues this way. For the commercial tools I checked only their published metric definitions, not their full products.
3. **Every number opens its PR list.** Each figure links to the PRs behind it.
4. **A written brief with checks.** Every bullet cites PRs and states only numbers from the computed facts, and known misreadings are rejected. None of the tools above writes one.
5. **Distinct-PR counting** for multi-SIG PRs in comparisons. (DevStats assigns PRs to SIGs by `sig/*` label, which suggests a multi-SIG PR counts toward each, as in this project's per-SIG tables. Not verified in its SQL.)

## What it doesn't do (and the others do)

- **Trends over time.** DevStats and the commercial tools show weeks and releases; this project is one snapshot. The weekly-refresh decision affects this.
- **Reviewer capacity.** DevStats's workload-per-reviewer is a real input to "why is this queue slow." This project deliberately has no individual data (ADR 0004), so it can't show capacity.
- **Filters** by PR size, kind or API change, which DevStats has.
- **Other repos.** DevStats covers every Kubernetes repository and CNCF project; this project covers `kubernetes/kubernetes`.

## Proposed positioning (for review; not yet applied to the PRD or README)

> Kubernetes already publishes detailed PR-velocity charts through CNCF DevStats. This project answers a narrower question that DevStats spreads across several dashboards: **right now, whose move is each open PR waiting on, and which team-and-stage queue holds the most waiting?** Every open PR is put in exactly one state, queues are ranked by PR-days of waiting, every number opens its PR list, and a short brief states the findings with PR citations and checked numbers. It reads timelines directly from GitHub's API rather than the GH Archive dataset DevStats uses. It is a single snapshot, not a trend chart, and it does not measure reviewer capacity.

## Open questions for the product owner

1. **Cross-check against DevStats?** Comparing one metric that both compute, such as median time to first non-author response, would show where they agree, and explain any gap by the documented differences (draft time, data source). That would strengthen credibility. It's free, but needs care with definitions.
2. **Trend or snapshot?** The weekly-refresh decision is also a positioning decision. Weekly runs would turn this into a slow trend line, which overlaps DevStats more. A snapshot keeps it a point-in-time diagnosis.
