# PRD: Delivery Bottleneck Analyzer (v1)

Status: draft for product-owner review, 2026-10-04

## Problem

Large engineering orgs lose most of their delivery time *waiting*, not building: waiting for a reviewer, an approver, a rebase, or CI. Status reports rarely show where that waiting happens or which team owns it. A Technical Program Manager's job is to find that queue and fix it, with evidence.

## Who it's for

- **Primary:** a TPM or engineering leader who wants an evidence-backed answer, on demand, to "where is work stuck, and whose queue is it in?"
- **Showcase audience:** hiring managers for TPM / Program roles. The repo demonstrates bottleneck analysis on a real, famous engineering org.

## Positioning

Kubernetes already publishes detailed PR-velocity charts through CNCF DevStats. This project answers a narrower question that DevStats spreads across several dashboards: **right now, whose move is each open PR waiting on, and which team-and-stage queue holds the most waiting?** It reads timelines directly from GitHub's API, ranks queues by PR-days of waiting, links every number to its PRs, and writes a short cited brief. It is a single snapshot, not a trend chart, and it doesn't measure reviewer capacity.

Approved by the product owner 2026-10-06. Research: [existing tools](research/existing-tools.md); [cross-check against DevStats](research/devstats-cross-check.md), which agrees on the main finding.

## Scope: v1 analyzes `kubernetes/kubernetes`

Why Kubernetes: large (about 80 merged PRs a week, 1,270 open), public, and every PR is labeled with the owning team (`sig/*`). Its merge bot (Prow) timestamps each review gate as a label (`lgtm`, `approved`), so every stage is measurable. It's not guesswork.

Research snapshot (2026-10-04, GitHub API):

| Signal | Count |
|---|---|
| Open PRs | 1,270 |
| Merged PRs, last 90 days | 1,027 |
| Open PRs labeled `needs-rebase` | 260 |
| Open PRs with `lgtm` but no `approved` | 79 |
| Open PRs labeled `lifecycle/stale` | 50 |

## What v1 does

1. **Fetch:** pulls merged PRs (last 90 days) and all open PRs, with their label, review and comment timelines.
2. **Measure merged PRs by stage.** Each PR's cycle time splits into:
   - **First response:** ready for review → first human comment or review (excluding the author and bots)
   - **Review:** ready → final `lgtm`
   - **Approval:** ready → final `approved`
   - **Merge wait:** both gates met → merged (CI and merge queue)
3. **Classify the open backlog** by whose move it is: author (`needs-rebase`, changes requested), reviewer (no `lgtm`), approver (`lgtm` without `approved`), untouched (no human response), on hold (`do-not-merge/*`).
4. **Roll up by team (SIG)** and rank bottlenecks: which SIG, which stage, how big the queue, and how old.
5. **Risks brief:** an LLM writes a short narrative from the computed metrics. Every claim cites PR numbers from the input, and a validator rejects any brief that cites a PR not in the data.
6. **Static dashboard,** an on-demand snapshot deployed on Vercel. The owner reruns it when wanted (ADR 0009).

## Success criteria

- A full run finishes inside the GitHub API rate limit, using only a personal token.
- Every number on the dashboard can be traced to PR numbers.
- The brief has zero uncited claims (enforced by code, not by prompt alone).
- Brief cost is announced before each run and stays under US$0.05 per run.
- The README reports only measured results.

## Out of scope (v1)

- Repos other than kubernetes/kubernetes. The code takes the repo as config, but only Kubernetes is validated.
- Individual-person rankings. The unit is the team/stage, never a named contributor (see ADR 0004).
- Recommendations that claim to know Kubernetes' internal priorities.
- Logins, databases and real-time updates.

## Known limits

- Labels are a proxy. A PR waiting on a reviewer who is on vacation looks the same as one that's waiting because the work is hard.
- Merged-only analysis hides PRs that never land, so v1 always reports the open backlog next to cycle times (ADR 0002).
- Prow removes `lgtm` when new commits are pushed. v1 uses the *final* `lgtm` and `approved` before merge, so rework loops are folded into review time.
