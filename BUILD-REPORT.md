# Build report: v1

Built 2026-10-04 to 2026-10-05 with AI coding agents (Claude Code), working from the PRD, 8 decision records and 8 tickets. The product owner reviewed the spec and made the product decisions. The agents wrote the code and tests.

## What was built

| Ticket | Result |
|---|---|
| 01 GitHub fetcher | GraphQL fetch of merged (90 days) and open PRs with full label, review and comment timelines. Splits date ranges to get past search's 1,000-result cap. |
| 02 Stage metrics | First response, review, approval, merge wait and cycle time per merged PR. Missing stages are null, never 0. |
| 03 Backlog classifier | Each open PR gets one state (whose move it is), plus its age and wait in that state. |
| 04 SIG rollups | Median and p90 per SIG and stage, backlog counts per state, and queues ranked by PR-days of waiting. |
| 05 Dashboard | One static HTML page, no build step. Light and dark themes, works at 360px, every number opens its PR list. |
| 06 Risks brief | OpenRouter call with a cost estimate first, a US$0.05 cap and a citation validator. Retries once, otherwise omits the brief. |
| 07 Weekly Action | Monday GitHub Action: test, fetch, compute, brief, commit. Vercel redeploys on push. |
| 08 README and this report | Measured numbers only. |

- **Tests:** 48, all passing (`npm test`). They cover stage edge cases (draft PRs, an lgtm removed by a new push, self-approval), every backlog state and its precedence, the rollup and ranking rules, the brief validator, and the brief's ground-truth checks against real past outputs.
- **Size:** about 1,240 lines across `src/`, `scripts/` and `site/index.html`. No runtime dependencies.

## Run cost

- **GitHub:** a full fetch takes about 6 minutes and uses about 320 GraphQL points, inside both the 5,000-an-hour personal limit and the 1,000-an-hour Actions limit.
- **Brief:** 7 paid runs during development on `openai/gpt-5-mini`, US$0.0206 in total. A passing run costs US$0.0020 to US$0.0042 (one or two attempts). The script refuses to run above US$0.05.

## Brief evaluation

Six of the seven runs were spent finding problems one at a time, because the brief started with a form validator and no ground truth (see SELF-REVIEW.md). The checks now computed from the metrics are: every number must appear in the input facts; seven known misreadings are rejected with their evidence; coverage of five key findings is scored; and a review sheet is written for a person.

| Run | Result | Caught automatically today? |
|---|---|---|
| 1 | Two-decimal days, speculation, jargon | Yes |
| 2 | "Global queue" labels | Yes |
| 3 | Leaked field names | Yes (three good bullets pass) |
| 4 | Leaked field names | No text saved |
| 5 | Malformed JSON twice | Fixed by structured outputs |
| 6 | Blamed the merge queue, which the data shows is fast | Yes |
| 7 | Passed; reviewed by the product owner, all five bullets true, bullet 1 reworded | Passes as written |

Published brief: run 7, covering 3 of 5 key findings. The rewording is recorded in `brief.json` and shown on the dashboard. Review record: `eval/brief/reviews/2026-10-05-run-7.md`.

## What didn't work, and what changed

- **Timelines nested in search results come back incomplete.** On #134037, search returned 35 timeline events and a direct query returned 49. The fetcher now lists PRs through search and fetches each timeline directly, 10 PRs per request.
- **Kubernetes bots look like humans.** `k8s-ci-robot` and `k8s-triage-robot` are typed `User`, not `Bot`, in GitHub's API, so they would have counted as first responses. A fixed list of bot logins is excluded on top of the actor type.
- **Most `do-not-merge/*` labels aren't holds.** The first classifier treated every `do-not-merge/*` label as on hold. The real label data showed most are author to-dos (missing release note, invalid commit message), so ticket 03 was revised: only `hold`, `work-in-progress` and `lifecycle/rotten` mean on hold.
- **Very old PRs sit in the review queue.** The longest-waiting review PR (#118378, 3.3 years) last had a comment from someone other than its author on 2023-06-07. Since then only the triage bot and the author have commented. Reviewer-queue waits are measured from ready time, as ticket 03 defines them, so PRs like this show their full wait.

## Open items

- Headline numbers on the dashboard are placeholders, to be confirmed against the live run before launch.
- Live link.
