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
| 07 Refresh and deploy | Built as a Monday GitHub Action, then replaced by an on-demand local snapshot (`npm run snapshot`) per ADR 0009. Vercel redeploys on push. |
| 08 README and this report | Measured numbers only. |

- **Tests:** 48, all passing (`npm test`). They cover stage edge cases (draft PRs, an lgtm removed by a new push, self-approval), every backlog state and its precedence, the rollup and ranking rules, the brief validator, and the brief's ground-truth checks against real past outputs.
- **Size:** about 1,620 lines across `src/`, `scripts/` and `site/`. No runtime dependencies.

## Run cost

- **GitHub:** a full fetch takes about 6 minutes and uses about 320 GraphQL points, inside the 5,000-an-hour limit for a personal token.
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

## Design

The dashboard was redesigned on 2026-10-06 following the Impeccable process Redline used: PRODUCT.md from a short interview, a direction round (four hands: the roll, a re-roll, a bolder hand, a safer hand), then the product owner chose a research-report direction in the manner of the DORA reports. The direction contract is in `.impeccable/surfaces/site-index-html.md` and the resulting system in DESIGN.md.

- The page uses one self-hosted face (Public Sans, OFL) so the CSP can stay `font-src 'self'`.
- The old pop-up dialog became an inline evidence panel: it opens after its figure or table, moves focus to its heading, and returns focus on Close or Escape. Scripted checks confirmed each of those, plus "Show all" and that every external link has `rel=noopener`.
- Checked at 1440px in light and dark, and at 390, 360 and 320px wide (no horizontal overflow). Text contrast is at least 4.54:1 in both themes. The Impeccable detector found nothing.
- Finish review (run in the main thread, not as a separate agent): three fixes applied (the ranked-queues table restacks on phones, the team table shows 10 teams first, Figure 1 labels say which value is the median and which the p90), one launch item open (the "Source on GitHub" link needs the real repository URL). Captures are in `.impeccable/review/`.
- Narrow-screen captures used a test copy of the site without the CSP, because the real policy (`frame-ancestors 'none'`) blocks the iframe the capture needs.

## Decisions made during the build

Product rules are in [ADR 0009](docs/adr/0009-on-demand-snapshot.md) (on-demand snapshot) and [ADR 0010](docs/adr/0010-ranking-and-counting-rules.md) (ranking and counting). Technical decisions:

- **Node 22.9+**, so `npm run brief` can read the key from `.env` with `--env-file-if-exists` and stay dependency-free.
- **The brief's input is finished sentences, not JSON fields.** The model copied field names ("medianWait") into two rejected runs. With sentences, there are no names to copy.
- **Structured output with `require_parameters`.** Two attempts returned malformed JSON. The request now sends a strict JSON schema and only goes to providers that honour it. `temperature` was dropped because the reasoning model doesn't support it and it would block routing.
- **Low reasoning effort and a 1,500-token output budget.** At 900 tokens a reasoning model ran out mid-reply.
- **A person's edits to a brief are recorded in `brief.json`** (before, after, reason) and shown on the dashboard. The edited text is re-checked.
- **Free stub and replay modes write only to `data/raw/`** (gitignored), so they can never publish.
- **Screenshots used headless Chrome on Windows,** because WSL's Chromium lacks system libraries.

## What couldn't be verified

- **The live site beyond a first check.** Deployed 2026-10-06 at https://delivery-bottleneck-analyzer-site.vercel.app. Checked on launch: every file loads, only `site/` is served (repo files return 404), all security headers including the CSP are live, and the page renders with its brief and PR links. A fuller findings pass on the live site follows.
- **Keyboard-only and screen-reader use** of the dashboard. Controls are native buttons, links and a `<dialog>`, but no one has navigated it that way.
- **Browsers other than Chrome,** and real phones. Phone width was checked at 360px in headless Chrome only.
- **Brief quality beyond this snapshot.** One brief was reviewed by a person. The traps catch known misreadings, not new ones, so every future brief still needs a person's review (README, "Refreshing the snapshot").
- **Which of our data or DevStats is closer to the truth** where they differ by 16-28%. See the [cross-check](research/devstats-cross-check.md).
- **`npm run snapshot` end to end since it was assembled.** Each step ran on its own (fetch on 2026-10-04, the rest on 2026-10-06), but the chained script hasn't. A full run takes about 6 minutes and changes the published numbers.

## Security review

Reviewed 2026-10-06 against commit 7735704, treating every file as new. It followed the method in Anthropic's `security-review` command (repository anthropics/claude-code-security-review), applied to whole files: only problems with more than 80% confidence that someone could exploit them count as findings.

**No problem met that bar.** What was checked:

- **Secrets.** `.env` has never been committed (`git log --all -- .env` is empty), and no OpenRouter, OpenAI or GitHub token pattern appears anywhere in the history. The OpenRouter key is read only in `scripts/brief.js` and sent only in the `Authorization` header to OpenRouter's fixed address. `GITHUB_TOKEN` is sent only to `api.github.com`. Neither is logged.
- **The published page** (`site/`). All text, including PR titles from GitHub and the model's brief, is set with `textContent`. There's no `innerHTML`, `eval` or `document.write`. PR links are built from integers, and the brief validator only accepts integer citations that are in the input. The theme value read from `localStorage` is only used as a `data-theme` attribute.
- **What the model sees.** Its input is code-built sentences, numbers, SIG names and PR numbers. No PR titles, comments or other text written by outsiders reach the prompt, so there's no route for prompt injection from GitHub content.
- **Queries.** The GitHub GraphQL queries interpolate only PR numbers from GitHub's own search results, and the DevStats cross-check query uses constants only.
- **The local preview server** (`scripts/serve.js`). Path traversal was probed with `../`, encoded `%2f` and `%2e%2e`, and absolute paths: every attempt returned 404.

**Hardening applied anyway** (not exploitable, but cheap):

- **The preview server crashed on a malformed URL** (`/%E0%A4%A` made `decodeURIComponent` throw outside the `try`). It now returns 404. It also listens on 127.0.0.1 instead of every network interface.
- **Content Security Policy for the public site** (`site/vercel.json`): `default-src 'none'`, scripts and styles only from the site itself, no framing, no forms, plus `nosniff`, a referrer policy and a permissions policy. The inline script and styles moved to `app.js` and `app.css` to allow this. The preview server applies the same headers. Checked in Chrome: the dashboard renders fully, and a test page's inline script was blocked.

**Left out under the rules:** the paid brief call is local-only and capped at US$0.05 (a cost question, not a vulnerability).

## Commands to run first

```bash
npm test               # 48 tests, no network
npm run serve          # the dashboard on the committed snapshot, http://localhost:8080
npm run eval:brief     # past model outputs against today's checks: runs 1, 2, 3 and 6 rejected, run 7 passes
```

## Open items

- Findings pass on the live site, then LEARNINGS.md (self-review step 7).
