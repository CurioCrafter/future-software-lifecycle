# Rules for coding agents in this repo

## Before you say "done"
- Run the tests, the build, and (for UI) take a screenshot and compare it with the design.
- **Paste the actual output** in the PR. "Tests pass" without output is not evidence.
- If you couldn't run something, say exactly what and why.

## Pull requests
- Fill in every section of the PR template, including risk tier and rollback plan.
- New behaviour goes behind a feature flag unless the PR says why it can't.
- Name the accountable human: the person who prompted you.

## Review findings
- Answer every finding: fix it, or close it with a one-line reason.
- **After 3 review rounds on the same PR, stop fixing findings one by one.** Step back, summarize what keeps going wrong, and propose a different approach to the human owner.

## Never
- Approve a PR as if you were a human. Your approval does not count toward required approvals.
- Merge with an open security finding.
- Skip or disable a check to make CI green.
