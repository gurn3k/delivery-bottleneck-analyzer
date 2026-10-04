# Context and glossary

- **PR:** pull request on `kubernetes/kubernetes`.
- **Ready time:** when a PR became reviewable. It's the latest `ReadyForReviewEvent` if the PR was ever a draft, otherwise `createdAt`.
- **Human:** any GitHub actor whose type is `User` and whose login is not on the bot list (`src/bots.js`).
- **First response:** the wait from ready time to the first comment or review by a human other than the PR author. If a reviewer engaged while the PR was still a draft, the wait is 0.
- **Final lgtm / final approved:** the last time each label was added before the merge (or before the snapshot, for open PRs) and not removed afterwards.
- **Gates met:** the later of final lgtm and final approved.
- **Merge wait:** gates met → `mergedAt`. Mostly CI and the Tide merge queue.
- **SIG:** Kubernetes Special Interest Group, read from `sig/*` labels. A PR with several SIG labels counts toward each one.
- **Cross-cutting PR:** a PR labeled with more than 3 SIGs (usually dependency bumps). These are reported separately so they don't swamp per-SIG numbers.
- **Backlog state:** whose move it is on an open PR. One of `on-hold`, `author`, `untouched`, `reviewer`, `approver`, `merge-pending`.
- **Median, p90:** the reported statistics. Means are never shown because a few year-old PRs distort them.
- **Insufficient data:** any group with fewer than 10 PRs. Shown as `—`, never ranked.
