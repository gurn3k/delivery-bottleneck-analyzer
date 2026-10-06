# What building v1 taught us

Written 2026-10-06, after launch. BUILD-REPORT.md says what was built and checked; SELF-REVIEW.md compares the build with Redline's process; FINDINGS.md covers the live test. This file records what isn't obvious from the code and would cost time to rediscover.

# Part one: the data and the claims

## GitHub data needs checking before it can be counted

Three things the API returned looked right and weren't. Timelines nested inside search results came back incomplete (35 events instead of 49 on #134037), so every timeline is fetched directly. Kubernetes' busiest bots, `k8s-ci-robot` and `k8s-triage-robot`, are typed as users, not bots, so they would have counted as the first human response on most PRs. And most `do-not-merge/*` labels turned out to be author to-dos, not holds. Each was found by reading real records, not by reasoning about what the labels should mean.

## A sentence can be wrong when every number in it is right

Three times a claim used correct numbers and still said something false:

- **Rounding has a direction.** The review p90 is 48.7 days. Rounded, it reads "49 days", and "over 49 days" was then false. The fix was at the source: any rounded value after "over" or "more than" now reads "about X or longer".
- **Medians don't add.** The review, approval and merge medians come from different distributions and can't be stacked into the 7.3-day cycle. Before writing "almost all their time is spent waiting for review", the share was measured per PR: 97.9% at the median.
- **Counts across labels overlap.** Two SIGs each have 120 PRs waiting for review, but together they hold 231, not 240, because some PRs carry both labels. Comparisons count distinct PRs.

None of these is caught by checking numbers against data. They're caught by asking what the sentence claims and measuring that.

## Passing the checks is not the same as being true

The model-written brief went through seven paid runs. Runs 1 to 5 failed on form: template wording, invented decimals, leaked field names, malformed JSON. Run 6 passed every check and was still wrong: it said the merge queue was slow, when merging is the fastest stage. Only a list of known false readings, checked in code, catches that. One of those checks then rejected an accurate sentence ("PRs stalled awaiting a reviewer") because it matched too broadly, so each check needs a test for what it must not catch as well as for what it must.

What made the brief reliable was structure, not prompting: facts handed to the model as finished sentences (it stopped copying field names), a strict JSON schema (it stopped returning broken JSON), and a budget large enough for a reasoning model's hidden tokens.

## Someone already built part of this

Kubernetes' own DevStats already charts time to approve, time to first response, and awaiting and inactive PRs by SIG. Found after the spec was written, it changed the positioning to the narrower question this project answers well: whose move each open PR is waiting on, ranked by team and stage. Recomputing DevStats' definitions on this data agreed on the main finding, which became one of the page's strongest proofs.

# Part two: running the build

## Ground truth before the first paid call

Six of the seven brief runs found problems that a free test with a stub model and a list of true and false claims would have found. The money was trivial (US$0.02 in total). The cost was the product owner's time and patience. The fix (`src/brief-checks.js`, `--stub`, `--replay`, the run history as regression cases) took less time than the runs it replaced.

## Decisions belong in the repo the moment they're made

Eleven ranking and counting rules were decided during the build and reported only in chat. They were moved into ADR 0010 later. The same applies to facts: an unverified claim ("Kubernetes maintainers are mostly volunteers") sat in ADR 0004 for two days before review caught it. Internal documents need sources too.

## A direction round needs something to look at

Without image generation, the design cards were text and palette swatches. The product owner re-rolled twice before saying "bolder", then went "safer" and chose a research report. Asking what was missing after the first re-roll, or showing quick sketches, would have reached the same answer sooner. The chosen direction (a DORA-style report) was the most familiar one on the table, and it fit the audience: a hiring manager trusts a report.

## Tooling notes for next time

- The site's own CSP (`frame-ancestors 'none'`) blocks the iframe harness used for narrow-screen captures. Use a throwaway server without the CSP for layout tests, never a weakened policy.
- Headless Chrome on Windows won't open a window narrower than about 500px; capture wider and crop (PowerShell `System.Drawing`).
- A headless screenshot taken after a page scrolls itself can come back blank. Measure scroll position with script instead.
- WSL's Chromium lacks system libraries; Windows Chrome in headless mode works from WSL.

# The three things to carry into the next build

1. **For any model output, write the ground truth and a free stub mode before the first paid call,** including the false readings you expect.
2. **Research existing tools before writing the spec.** "How is this different from X?" deserves a written, checked answer.
3. **Check what each sentence claims, not only its numbers:** the rounding direction, whether the numbers can be combined, and whether counts overlap.
