# 05: Static dashboard

A single `site/index.html` reading `data/metrics.json`: headline numbers, stage breakdown, a backlog-by-state view, a SIG table, and a brief panel. Every number links or drills down to PR numbers.

**Acceptance criteria**
- No build step. Works when opened from a static host.
- Light and dark themes, usable at phone width.
- `—` for insufficient data, never 0.
