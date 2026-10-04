# 02: Stage metrics for merged PRs

Pure functions turning one PR's raw timeline into stage durations: first response, review (final lgtm), approval (final approved), merge wait, total cycle time. Definitions in CONTEXT.md.

**Acceptance criteria**
- Bots and the PR author never count as first response.
- Draft time is excluded (clock starts at ready time).
- A label removed and re-added uses the final add.
- A missing stage is `null`, never 0.
- Unit tests with fixtures, including a draft PR, an lgtm removed by a new push, and a self-approved PR.
