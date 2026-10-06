# 0010: Ranking and counting rules decided during the build

**Status:** accepted 2026-10-04 to 2026-10-06. Ranking by PR-days was chosen by the product owner (ticket 04). The rest were decided during implementation, reported at the time, and recorded here on 2026-10-06 so they are in the repo, not only in chat.

**Decisions:**

1. **Rank queues by PR-days of waiting:** open PRs in a SIG-and-state queue × their median wait in that state. Ties go to the larger queue. *(Product owner.)*
2. **On-hold PRs are counted but never ranked.** Drafts, held PRs (`do-not-merge/hold`, `work-in-progress`) and `lifecycle/rotten` PRs are parked on purpose.
3. **Author queues are ranked**, labeled "owner: author" so they don't read as slow reviewers. Waiting on an author is still waiting.
4. **Cross-cutting PRs (more than 3 SIGs) and PRs with no SIG label get their own rows and are never ranked**, so dependency bumps and untriaged PRs don't distort any team's numbers.
5. **Example PRs are the five longest-waiting in the queue,** because waiting time is what's ranked.
6. **Percentiles use the nearest-rank method** (`percentile_disc`), the same as CNCF DevStats, so the [cross-check](../../research/devstats-cross-check.md) compares like with like.
7. **The minimum sample of 10 applies to each statistic,** not only each group. A SIG with 40 merged PRs but 6 approvals still shows `—` for approval time.
8. **Waits in the reviewer queue run from ready time,** as ticket 03 defines it. A PR that had one early comment and nothing since shows its full wait.
9. **Comparisons across SIGs count distinct PRs.** A PR labeled with both SIGs counts once (231 PRs, not 240). Per-SIG tables still count it in each SIG, which the table notes.
10. **Durations under a day are shown in hours** (1.7 h, not 0.07 d). Everything else is in days.
11. **PR titles are included in the published data** for drill-down lists. They're public on GitHub. Reviewer and commenter names are not included (ADR 0004).

**Why:** each rule either keeps the ranking honest about who owns a queue, or keeps a number reproducible from the data. Writing them down separates decisions from accidents.
