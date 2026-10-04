# 0003: Every claim in the brief cites PRs, enforced by code

**Status:** accepted 2026-10-04

**Decision:** the LLM-written brief must cite PR numbers for every claim. A validator rejects the brief if it cites a PR number that wasn't in the input, or if a bullet has no citation. A rejected brief is retried once, then omitted. Nothing unvalidated is published.

**Why:** a bottleneck report is only useful if a reader can check it. This carries over Redline's core rule (every flag cites its exact source) into a new domain.
