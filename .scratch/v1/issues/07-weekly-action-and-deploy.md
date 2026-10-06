# 07: Weekly GitHub Action and Vercel deploy

A scheduled workflow (Mondays) that runs fetch → metrics → brief, commits updated JSON, and lets Vercel redeploy.

**Acceptance criteria**
- Uses the built-in `GITHUB_TOKEN` for fetching, and an `OPENROUTER_API_KEY` repo secret.
- If the brief fails validation, the metrics still publish.

*Revised 2026-10-06 (ADR 0009): the product owner chose an on-demand snapshot over a weekly refresh. The scheduled workflow was removed; refreshing is `npm run snapshot` locally, then a reviewed brief and a push.*
