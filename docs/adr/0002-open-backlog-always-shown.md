# 0002: The open backlog is always shown next to cycle times

**Status:** accepted 2026-10-04

**Decision:** no merged-PR cycle-time number is shown without the open-backlog view beside it.

**Why:** merged-only metrics have survivorship bias. A team that leaves hard PRs open forever looks fast. Kubernetes has 1,270 open PRs against roughly 1,027 merged in 90 days, so the backlog is where most of the waiting lives.
