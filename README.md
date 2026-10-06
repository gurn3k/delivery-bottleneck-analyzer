# Delivery Bottleneck Analyzer

Finds where pull requests wait in a large engineering org, by team (SIG) and review stage. v1 analyzes `kubernetes/kubernetes` from public GitHub data, as an on-demand snapshot.

**Live dashboard:** _link added at launch_

Kubernetes already publishes detailed PR-velocity charts through CNCF DevStats. This project answers a narrower question that DevStats spreads across several dashboards: **right now, whose move is each open PR waiting on, and which team-and-stage queue holds the most waiting?** It reads timelines directly from GitHub's API, ranks queues by PR-days of waiting, links every number to its PRs, and writes a short cited brief. It is a single snapshot, not a trend chart, and it doesn't measure reviewer capacity. See [existing tools](research/existing-tools.md).

Built with AI coding agents (Claude Code) from a product spec ([PRD.md](PRD.md)), [decision records](docs/adr/) and [tickets](.scratch/v1/issues/).

## What it measures

Every merged PR's time is split into stages, all measured from when it became ready for review:

| Stage | From → to |
|---|---|
| First response | ready → first comment or review by a human other than the author |
| Review | ready → final `lgtm` label |
| Approval | ready → final `approved` label |
| Merge wait | both labels set → merged (CI and the merge queue) |

Every open PR is put in exactly one backlog state, depending on whose move it is: no human response yet, waiting on review, waiting on approval, waiting to merge, waiting on the author, or on hold.

Queues are then ranked by **PR-days of waiting**: open PRs in a team-and-stage queue × their median wait. That counts both how many PRs are stuck and how long they've been stuck.

## Findings (snapshot of 2026-10-04)

Measured on 1,027 PRs merged from 2026-07-06 to 2026-10-03 and all 1,270 PRs open on 2026-10-04.

- **Getting reviewed is the bottleneck. Merging isn't.** The median merged PR took 7.3 days from ready to merged. Review was the slow stage: 4.1 days at the median, but 49 days for the slowest 1 in 10. Once both labels were set, the median PR merged in 1.7 hours.
- **Two queues hold the most waiting.** sig/api-machinery's review queue holds 120 open PRs with a median wait of 85 days (10,198 PR-days). sig/node's holds 120 PRs at 75 days (9,032 PR-days).
- **272 open PRs (21%) have no human response yet.** Their median wait is 41 days. sig/api-machinery has 94 of them, the third-largest queue overall.
- **The author's move is as common as the reviewer's.** 337 open PRs are waiting on their author (rebase, requested changes or a process label), against 368 waiting on review.

**Agrees with Kubernetes' own DevStats.** Recomputing DevStats' "PR Time to Approve and Merge" definitions on this data for PRs created in August and September 2026 gives the same picture: most of the time is spent waiting for lgtm, and merging after approval takes hours at the median. The medians differ by 16-28%, and the likely causes are documented in the [cross-check](research/devstats-cross-check.md).

These numbers are a snapshot of 2026-10-04. `npm run snapshot` refreshes it.

## Method and limits

- Review and approval come from the `lgtm` and `approved` labels that Kubernetes' merge bot (Prow) sets. If a label is removed and re-added, the final add is used, so rework counts as review time.
- Bots and the PR's own author never count as a response. Some Kubernetes bots are typed as regular users, so a fixed list of bot logins is also excluded (`src/bots.js`).
- Only medians and p90 are reported, never means. Any group under 10 PRs shows `—` and is never ranked.
- A PR labeled with more than 3 SIGs (usually dependency bumps) is reported as cross-cutting instead of being counted in every SIG.
- Labels are a proxy. A PR waiting on a reviewer who is away looks the same as one waiting because the change is hard.
- The unit of analysis is team and stage, never a person ([ADR 0004](docs/adr/0004-teams-and-stages-not-people.md)).

The risks brief is written by a small LLM via OpenRouter, from the computed numbers only. Every bullet must cite PRs from its input. A validator rejects any bullet that's uncited or cites a PR not in the data, and if no brief passes, the snapshot ships without one. The script prints its cost estimate before calling and refuses to run above US$0.05. Beyond citations, every number in a bullet must appear in the computed facts, and known misreadings of the data (for example "the merge queue is slow", when merging takes 1.7 hours at the median) are rejected with the evidence. Past model outputs are kept in `eval/brief/history/` as regression cases.

## Run locally

```bash
export GITHUB_TOKEN=$(gh auth token)
npm run snapshot # fetch + metrics + brief cost estimate (no paid call), about 6 minutes

# or step by step:
npm run fetch   # about 6 minutes, roughly 320 of GitHub's 5,000 hourly API points
npm run metrics # SIG rollups and bottleneck ranking, writes site/data/metrics.json
npm run serve   # dashboard at http://localhost:8080
npm run brief -- --dry-run   # prints the estimated cost, makes no call (needs OPENROUTER_MODEL)
npm run brief                # paid: writes site/data/brief.json (needs OPENROUTER_API_KEY in .env)
npm run brief -- --stub       # free: runs the whole brief pipeline with a stub model
npm run eval:brief           # free: scores past model outputs against ground truth
npm run score:brief -- --sheet  # writes a review sheet for a person to check the brief
npm run cross-check          # free: compares with DevStats (needs data/raw from npm run fetch)
npm test
```

No runtime dependencies. Node 22.9+.

## Refreshing the snapshot

The dashboard is a snapshot, refreshed when the owner chooses (ADR 0009):

1. `npm run snapshot` fetches PRs, recomputes the metrics and prints the brief's cost estimate.
2. `npm run brief` writes the brief (paid, a fraction of a cent). It must pass every check or the snapshot ships without one.
3. `npm run score:brief -- --sheet` writes a review sheet. A person marks each bullet before publishing.
4. Commit `site/data/` and push. Vercel serves `site/` and redeploys on push.

The OpenRouter key stays in the local `.env`. Nothing runs on a schedule and no key is stored on GitHub.

## License

MIT
