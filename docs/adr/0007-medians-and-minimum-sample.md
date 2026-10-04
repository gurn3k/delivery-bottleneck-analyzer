# 0007: Medians and p90 only, with a minimum sample of 10

**Status:** accepted 2026-10-04

**Decision:** stage durations are reported as median and p90. Groups with fewer than 10 PRs show `—` and are never ranked. PRs with more than 3 SIG labels are reported as "cross-cutting" instead of being counted in each SIG.

**Why:** PR durations are heavily skewed, since a few year-old PRs wreck a mean. Ranking a SIG on 3 PRs is noise presented as a finding.
