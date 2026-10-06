# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a hiring manager for TPM and program roles,** landing on the public dashboard from Gurnek Khaira's resume, LinkedIn or the GitHub repo. They have about 30 seconds, aren't necessarily Kubernetes experts, and are judging two things: whether the analysis is real, and whether its author thinks like a TPM. (Confirmed by the product owner, 2026-10-06.)

**Secondary: a TPM or engineering leader** who digs in, opens the PR lists, checks the method, and asks whether this would work on their own org.

## Product Purpose

Shows where pull requests wait in a large engineering org, by team and review stage, using `kubernetes/kubernetes` as a real, public example. Success is a visitor leaving with the finding, that review and not merging is where PRs wait, and that two teams' review queues hold most of it, plus confidence that every number traces to real PRs.

## Positioning

Kubernetes already publishes detailed PR-velocity charts through CNCF DevStats. This project answers a narrower question that DevStats spreads across several dashboards: right now, whose move is each open PR waiting on, and which team-and-stage queue holds the most waiting? It reads timelines directly from GitHub's API, ranks queues by PR-days of waiting, links every number to its PRs, and writes a short cited brief. It's a single snapshot, not a trend chart, and it doesn't measure reviewer capacity. (Approved 2026-10-06; see `research/existing-tools.md`.)

## Operating Context

- A hiring manager opens the link on a laptop or a phone, between other tasks, often from a resume PDF or LinkedIn message.
- The page is one static snapshot (fetched 2026-10-04), refreshed by the owner on demand (ADR 0009). The fetch date must always be visible.
- A visitor who wants proof clicks a number and gets the list of PRs behind it, each linking to GitHub.
- The repo (PRD, ADRs, eval, build report, self-review) is the second stop for anyone judging the work.

## Capabilities and Constraints

- Static site (`site/`): one HTML page, `app.js`, `app.css`, and JSON data. No build step, no runtime dependencies, served by Vercel with a strict CSP (scripts and styles from the site itself only, so no web fonts or CDNs).
- Data: 1,027 merged PRs (90 days) and 1,270 open PRs, each open PR in exactly one whose-move state. Medians and p90 only; groups under 10 PRs show `—`.
- Every number must open its PR list. Light and dark themes, usable at 360px.
- The risks brief is model-written, checked by code, and reviewed by a person before publishing.
- Terminology: "SIG" (Kubernetes team), "lgtm" and "approved" (the two review labels), "PR-days of waiting" (the ranking unit), "whose move" (backlog state).

## Brand Commitments

- Byline: "Built by Gurnek Khaira" with a link to the GitHub repo. No LinkedIn link, no marketing copy. (Confirmed 2026-10-06.)
- Honesty: measured numbers only; "built with AI coding agents" stated plainly.
- **Never blame people.** The unit is the team and stage, never a contributor (ADR 0004). Copy and visuals must read as a queue to fix, not a team to shame. The product owner named this as the one thing that would make a polished result feel wrong.

## Evidence on Hand

- `site/data/metrics.json`: the snapshot, with per-PR records for every drill-down.
- `site/data/brief.json`: the published brief, reviewed by the product owner, with one recorded edit.
- `research/devstats-cross-check.md`: agreement with Kubernetes' own DevStats on the main finding.
- `BUILD-REPORT.md`, `SELF-REVIEW.md`, `eval/brief/`: how it was built and checked.
- No testimonials, users, adoption numbers or endorsements exist. Never imply Kubernetes or CNCF endorses or uses this.

## Product Principles

1. **Finding first, proof one click away.** Lead with what the data says; make every claim checkable.
2. **Queues, not people.** Name teams and stages, frame waiting as a system property, and never rank individuals.
3. **Say what it can't show.** Limits (a snapshot, labels as a proxy, no capacity data) sit next to the findings, not in a footnote nobody reads.
4. **Plain language for a non-Kubernetes reader.** Explain lgtm, SIG and PR-days where they first appear.

## Accessibility & Inclusion

WCAG 2.1 AA contrast in both themes, identity never carried by color alone, full keyboard use of every drill-down, and a layout that works at 360px.
