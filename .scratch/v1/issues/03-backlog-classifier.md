# 03: Open-backlog classifier

Assign each open PR one backlog state (whose move it is), plus its age and how long it has waited in that state. Precedence: on-hold > author > untouched > reviewer > approver > merge-pending.

**Acceptance criteria**
- Draft, `do-not-merge/hold`, `do-not-merge/work-in-progress` or `lifecycle/rotten` → on-hold.
- `needs-rebase`, any other `do-not-merge/*` (missing release note, SIG, kind, etc.), `cncf-cla: no`, or a latest decisive review of `CHANGES_REQUESTED` → author.
- No human response since ready → untouched. No lgtm → reviewer. lgtm without approved → approver. Both → merge-pending.
- Waiting time starts at the event that put the PR in its state (for example, final lgtm for approver), falling back to ready time.
- Unit tests for each state and for precedence.

*Revised 2026-10-04 after reviewing real label data: most `do-not-merge/*` labels are author to-dos, not holds.*
