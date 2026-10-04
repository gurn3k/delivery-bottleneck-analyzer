# Delivery Bottleneck Analyzer

Finds where pull requests wait in a large engineering org, by team (SIG) and review stage. v1 analyzes `kubernetes/kubernetes` from public GitHub data.

**Status:** in progress. See [PRD.md](PRD.md), [decision records](docs/adr/) and [tickets](.scratch/v1/issues/).

Built with AI coding agents (Claude Code) from a product spec, decision records and tickets.

## Run locally

```bash
export GITHUB_TOKEN=$(gh auth token)
npm run fetch   # about 6 minutes, roughly 320 of GitHub's 5,000 hourly API points
npm test
```

No runtime dependencies. Node 20+.
