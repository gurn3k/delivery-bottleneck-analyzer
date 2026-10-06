# Self-review: v1 against Redline's process

Written 2026-10-05, after tickets 01-08 and six paid brief runs. It compares this build, step by step, with the process Redline used (its `research/`, `PRD.md`, ADRs, `.scratch` briefs, fixtures, `BUILD-REPORT.md`, `FINDINGS.md`, security review, `PRODUCT.md` / `DESIGN.md` and `LEARNINGS.md`).

Verdicts: **Followed**, **Partly**, **Skipped**.

## Step by step

| # | Redline step | This build | Verdict |
|---|---|---|---|
| 1 | Research before the spec: four research passes (who has the pain, what goes wrong, existing tools, who would pay), then `research/summary.md` | One API snapshot of label counts in the PRD. No look at existing tools. | **Skipped** |
| 2 | PRD, CONTEXT glossary, ADRs | PRD, CONTEXT and 8 ADRs, reviewed by the product owner before code | **Followed** |
| 3 | Self-contained ticket briefs written up front: files to read, criteria, an "out of bounds" list, and a note on what the next ticket needs | Tickets of 4-6 lines. No out-of-bounds list, no downstream notes, no definition of a good brief in ticket 06 | **Partly** |
| 4 | Fixtures before code: a hostile fixture with ground truth, checked by a script before any paid work | Unit tests use small hand-built PRs, and the real snapshot was spot-checked. **The brief had no fixture and no ground truth at all.** | **Partly** (metrics) / **Skipped** (brief) |
| 5 | A stub model client, so the pipeline runs end to end for free | None. Every brief run was a paid call. | **Skipped** |
| 6 | Anti-stub rule; the suite only grows, and no earlier assertion is weakened | Tests went 15 → 38 by addition. One test file's fixture changed shape (a Set became citation groups) for a new validator signature, with no assertion removed. | **Followed** |
| 7 | One commit per ticket, and the message says why | Yes, 9 local commits | **Followed** |
| 8 | Live smoke run against the real model | Yes, six runs | **Followed**, but see step 9 |
| 9 | Eval against labeled ground truth, measured two ways (strict and by type), plus a person reading the top-severity output | None. "Passes the validator" stood in for "is correct." | **Skipped** |
| 10 | Provider pinning, so a silent reroute becomes a visible refusal | `require_parameters` added after run 5. The provider isn't pinned. | **Partly** |
| 11 | Every piece of reader-facing copy goes through the `humanizer` skill | Not run on the dashboard copy, README or BUILD-REPORT. The skill is installed but not enabled in this project. | **Skipped** |
| 12 | BUILD-REPORT with a finished-means checklist, decisions made in the operator's absence, what couldn't be verified, and commands to run first | Has what was built and what didn't work. Decisions I made alone (ranking exclusions, example ordering, percentile method) are only in chat. There's no "couldn't verify" section. | **Partly** |
| 13 | FINDINGS: a live adversarial test of the deployed site on a fixed budget, with numbered findings, steps, "not tested" and "what held up" | Not deployed yet | **Not yet due** |
| 14 | Security review (Anthropic's method, only findings above 80% confidence) | Not done | **Skipped** |
| 15 | Design track: PRODUCT.md, surface brief, Impeccable direction round, screenshot review, DESIGN.md | Only the dataviz skill and my own screenshots. No product or design brief, and no direction round with you. | **Skipped** |
| 16 | LEARNINGS.md: product and process lessons, and three things to carry forward | This file is the start of one | **Partly** |

## What the gaps cost

**The brief (steps 4, 5 and 9).** Redline's lesson was to build the hostile fixture first, on the axis the product depends on. For the brief, that axis is *meaning*: does each sentence say something true about the data? I built a validator for *form* (citations, counts, banned words) and then used paid runs to discover the meaning problems one at a time:

| Run | What it exposed | A free fixture would have caught it? |
|---|---|---|
| 1 | Template wording, false precision, speculation, an off citation | Yes, as a rubric check |
| 2 | Labels pasted in as nouns | Yes |
| 3 | A field name leaked | Yes, with a stub that echoes the input |
| 4 | Field names leaked again | Yes |
| 5 | Malformed JSON | Partly. Schema enforcement is a design choice, not something a fixture finds |
| 6 | Passed, but bullet 1 blames the merge queue, which the data shows is the fast stage | **Only with ground truth**: a list of true and false claims about this data |

The money was small (US$0.0164 in total), but the cycle cost your time and trust. Redline also notes that "passes the checks" and "is right" are different measurements, and that you have to report both.

**Research (step 1).** Kubernetes already publishes DevStats (k8s.devstats.cncf.io), which has a "PR Time to Approve and Merge" dashboard (checked 2026-10-05). A hiring manager who knows Kubernetes may ask how this differs. The likely answer is real: DevStats charts time-to-approve and time-to-merge, while this tool ranks *whose move* each open PR is waiting on, by SIG, and writes a cited brief. But that answer should be researched and written into the PRD and README, not improvised in an interview.

**Briefs and decisions (steps 3 and 12).** Several product calls were made during the build: on-hold PRs aren't ranked, author queues are, cross-cutting and no-SIG PRs aren't ranked, examples are ordered longest-waiting first, and percentiles use the nearest-rank method. Each was reasonable and was reported in chat, but none is in the repo. Redline's rule is that the briefs and the build report are the audit trail that separates a decision from a guess.

**Copy, security and design (steps 11, 14 and 15).** The dashboard is the public face, and its copy, look and safety were checked only by me. Redline says plainly that headless screenshots aren't the same as a person looking at the product.

## What held up

- Spec-first: the PRD, CONTEXT and ADRs were reviewed before code, and the build stayed inside them (no individual rankings, medians only, minimum sample of 10).
- Numbers trace to PRs: every dashboard number opens its PR list, and three ranked examples were checked against raw data.
- Honest reporting: the build report caught and removed one claim the data didn't support (#118378's stale-label story).
- Double counting caught in code: the "two SIGs hold 63% of the review queue" comparison counts distinct PRs (231, not 240).
- Fail-closed brief: four bad runs published nothing, and the metrics were never blocked.
- Cost discipline: an estimate was printed before every paid call, every run was approved, and the hard cap was never approached.

## Recommended order from here

1. **Brief eval fixture (free).** Write a ground-truth file for this snapshot: 10-15 true claims and 10-15 tempting false ones (for example "the merge queue is slow," "approvers are the bottleneck"). Add a stub model mode, so the pipeline and validator run for free, and a scoring script that a person checks once per real run. Only then do one paid run, and judge it against the fixture, not by taste.
2. **Research pass:** existing tools (DevStats, plus commercial engineering-metrics products) and what this adds. Update the PRD's positioning and the README.
3. **Put the decisions in the repo:** add the build-time decisions as ADR 0009 and a "Decisions made during the build" section in BUILD-REPORT, plus a "What couldn't be verified" section (the Action with the built-in token, Vercel, keyboard and screen-reader use, touch tooltips).
4. **Humanizer pass** on the dashboard copy, README and BUILD-REPORT.
5. **Design track:** PRODUCT.md, a surface brief, a direction round with you, a screenshot review, then DESIGN.md.
6. **Security review** before the repo goes public.
7. **After launch:** a FINDINGS pass on the live site, then LEARNINGS.md.

## Progress

- **Step 1, brief ground truth:** done 2026-10-05. Number check, seven traps, coverage, review sheets, stub and replay modes, past runs as regression cases. Run 7 passed and was reviewed by the product owner.
- **Step 2, research:** done 2026-10-06. [Existing tools](research/existing-tools.md) and a [DevStats cross-check](research/devstats-cross-check.md); positioning approved and applied to the PRD and README. This also led to ADR 0009: an on-demand snapshot instead of a weekly refresh.
- **Step 3, decisions in the repo:** done 2026-10-06. ADR 0010, plus BUILD-REPORT sections for technical decisions, what couldn't be verified, and commands to run first.
- **Step 6, security review:** done 2026-10-06, ahead of steps 4-5 so code fixes land before copy and design work. No exploitable findings; preview-server crash fixed, CSP added.
- Steps 4, 5 and 7: not started.

## Three things to carry into the next build

1. **For any LLM output, write the ground truth before the first paid call,** including the false claims you expect it to make.
2. **Research existing tools before the PRD,** even for a portfolio piece. The interview question "how is this different from X?" deserves a written answer.
3. **Record a decision in the repo the moment you make it,** not in chat.
