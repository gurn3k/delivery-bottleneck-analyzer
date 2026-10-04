# 06: Weekly risks brief with citation validator

Send computed metrics plus example PRs to OpenRouter and get back 4 to 6 cited bullets. Validate, then write `site/data/brief.json`.

**Acceptance criteria**
- Prints estimated cost and exits if `--dry-run` is set. Input capped to keep cost under US$0.05.
- The validator rejects uncited bullets and citations not in the input. Retries once, then omits the brief.
- Unit tests for the validator.
