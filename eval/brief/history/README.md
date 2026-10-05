# Brief eval history

Real model outputs from the first paid brief runs (2026-10-05, `openai/gpt-5-mini`), kept as regression fixtures. Each file records what the run produced and why it was rejected. `npm run eval:brief` scores them against today's checks; every rejected run must still be rejected.

- Runs 4 and 5 left no saved text (rejected replies weren't kept until after run 5). Run 4 leaked field names ("medianWait", "prDaysOfWaiting"); run 5 returned malformed JSON twice, fixed by structured outputs.
- The PR numbers and figures refer to the 2026-10-04 snapshot.
