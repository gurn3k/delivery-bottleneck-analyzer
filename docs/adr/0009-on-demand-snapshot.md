# 0009: An on-demand snapshot, not a weekly refresh

**Status:** accepted 2026-10-06. Replaces the schedule in ADR 0005.

**Decision:** the dashboard is a point-in-time snapshot that the owner refreshes when wanted, locally: `npm run snapshot`, then the brief, a person's review of the brief, and a push. There's no scheduled GitHub Action, and the OpenRouter key never leaves the local `.env`.

**Why:**
- **Positioning.** CNCF DevStats already charts Kubernetes PR velocity over time ([research](../../research/existing-tools.md)). Weekly runs would make this a slower, narrower trend chart. A snapshot keeps it what it's for: a diagnosis of where work is waiting right now.
- **Review.** Since the brief eval ([SELF-REVIEW.md](../../SELF-REVIEW.md)), a person reviews each brief before it's published. An unattended weekly run would publish unreviewed briefs.
- **Less setup and less exposure:** no repo secret, no Actions write permission, no scheduled spend.

**Trade-off:** the data goes stale between refreshes, so the dashboard shows its fetch date prominently.
