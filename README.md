# Delivery Bottleneck Analyzer

Finds where pull requests wait in a large engineering org, by team (SIG) and review stage. v1 analyzes `kubernetes/kubernetes` from public GitHub data.

**Status:** in progress. See [PRD.md](PRD.md), [decision records](docs/adr/) and [tickets](.scratch/v1/issues/).

Built with AI coding agents (Claude Code) from a product spec, decision records and tickets.

## Run locally

```bash
export GITHUB_TOKEN=$(gh auth token)
npm run fetch   # about 6 minutes, roughly 320 of GitHub's 5,000 hourly API points
npm run metrics # SIG rollups and bottleneck ranking, writes site/data/metrics.json
npm run serve   # dashboard at http://localhost:8080
npm run brief -- --dry-run   # prints the estimated cost, makes no call (needs OPENROUTER_MODEL)
npm run brief                # paid: writes site/data/brief.json (needs OPENROUTER_API_KEY in .env)
npm test
```

No runtime dependencies. Node 22.9+.
