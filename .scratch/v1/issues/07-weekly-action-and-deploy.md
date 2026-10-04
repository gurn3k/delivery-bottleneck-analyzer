# 07: Weekly GitHub Action and Vercel deploy

A scheduled workflow (Mondays) that runs fetch → metrics → brief, commits updated JSON, and lets Vercel redeploy.

**Acceptance criteria**
- Uses the built-in `GITHUB_TOKEN` for fetching, and an `OPENROUTER_API_KEY` repo secret.
- If the brief fails validation, the metrics still publish.
