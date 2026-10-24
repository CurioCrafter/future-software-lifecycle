---
name: lifecycle
description: Use when the user asks to run a change through the Future Software Lifecycle board (open a change, self-verify, AI review, security review, CI, approval, flags, ramp), to check what is blocking a change, to map decisions to human attention, to record an incident as a reviewer test, or to start the lifecycle dashboard.
---

# Lifecycle board

The board is a local dashboard plus a CLI. **You act through the CLI; humans act in the GUI.** Every CLI call shows up live on the board.

`LC` below means `node <path-to>/lifecycle/cli.mjs` (in this repo: `node lifecycle/cli.mjs`). State lives in `.lifecycle/state.json` in the current folder.

## Start
1. If `.lifecycle/state.json` doesn't exist: `LC init`.
2. Start the board in the background if it isn't running: `node lifecycle/server.mjs` → tell the user to open http://localhost:4317.
3. `LC status` shows every open change and exactly what blocks it. Check it before and after every step.

## The non-negotiables
- **Never claim a human approved.** You can't approve as a human; `LC approve` records an agent approval that never counts. When a change needs a human, tell the user: "C3 needs N human approval(s): open it on the board and click Approve."
- **The prompter owns the change.** `--owner` is the human who asked you for the work. Ask if unsure.
- **Evidence is a real run, never a claim.** Use `LC evidence <id> --cmd "<test command>"`. It runs the command and records the output.
- **Every finding gets an answer:** `LC resolve <id> <F#> --fixed` or `--closed "reason"`.
- **After 3 review rounds, stop patching.** Summarize what keeps failing, propose a different approach to the user, record it with `LC rethink <id> --text "..."`.
- **Never touch a halted ramp.** A human halted it; ask them.
- Don't invent findings to look thorough. Don't skip a step to make the board green.

## One change, step by step
On a subscription, run one stage per user prompt unless the user says to keep going. Report the board state after each.

| Stage | What you do | CLI |
|---|---|---|
| Spec | Write acceptance criteria a machine can check, get the user's OK | `LC new --title "..." --owner @user --tier 0/1/2 --spec "..."` then `LC advance <id>` |
| 1 Self-verify | Make the change, then run the tests/build | `LC evidence <id> --cmd "npm test"` → `LC advance <id>` |
| 2 AI review | Start a round, review the diff yourself (or spawn reviewer subagents: several hunt, then a separate pass keeps only findings most agree on), record findings, fix or close each | `LC round <id>`, `LC finding <id> --kind bug --text "..." --by reviewer-1`, `LC resolve ...`, `LC advance <id>` |
| 3 Security | Review the diff for exploitable problems only | `LC finding <id> --kind security --text "..."` (if any), `LC security <id>`, `LC advance <id>` |
| 4 CI | Run the project's full check | `LC ci <id> --cmd "npm run build && npm test"` → `LC advance <id>` |
| 5 Approval | Tell the user how many human approvals the tier needs; they click Approve in the GUI | `LC advance <id>` after they approve |
| 6 Ship | Merge queue re-checks everything; put it behind a flag; ramp | `LC advance`, `LC flag <id> --name x`, `LC advance`, `LC ramp <id> --pct 10/50/100`, `LC advance` |

**Pick the tier from the change, not the author** (see `templates/risk-tiers.yml`): docs/typos = 0, ordinary product change = 1, auth/payments/migrations/infra/security/irreversible = 2. When unsure, go one higher.

Use `--role` so the org chart lights up: `worker` (building), `reviewer`, `security`, `coordinator` (advancing, CI), `manager` (ramps, decision map).

## API mode (optional, costs API tokens)
If the user wants layers 2 and 3 run automatically on their own API key: `cd lifecycle && npm install` once, then `node lifecycle/autopilot.mjs <id> --base main --test "npm test"`. It runs several reviewers in parallel, a voting pass, and a security reviewer, and posts results to the board. Say what it will cost roughly (a few cents to a few dollars per round depending on diff size and model) before running it. It never approves or merges.

## Other jobs
- **Decision map:** `LC decision D7 --level none|on|in|licensed --owner @x`. Humans can also drag decisions in the GUI. Move a decision toward less attention only with evidence.
- **The floor:** `LC floor --tests yes` etc. only when that plank truly exists (agent-runnable tests, feature flags, staged releases, rollback under an hour). Tier 0 skips humans only once all four are in.
- **Incidents:** `LC incident --title "..." --should "what a reviewer should have said" --change C3`, then after testing the reviewer against it, `LC score I1 yes|partly|no`.
- **Revert:** `LC revert <id> --reason "..."`. The revert rate is the guardrail: if it rises, review got too loose.
