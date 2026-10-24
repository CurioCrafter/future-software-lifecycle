# Future Software Lifecycle

A copyable blueprint for running software development when AI agents write most of the code.

Humans can no longer read every line. So instead of asking *"did a human read this?"*, this blueprint asks *"which check, automated or human, is the right one to catch what could go wrong?"*, and builds the system around that question.

## Credit

This blueprint is based on the ideas in **David Shapiro's** video:

**[▶ Watch the video on YouTube](https://www.youtube.com/watch?v=VmrNsOVOAt4)**

The video breaks down Anthropic's October 2026 post on how the Claude Code team reviews its own code (where Claude writes about 90% of the code), and connects it to much older ideas: database write-ahead logs, TCP checksums, error-correcting memory, double-entry bookkeeping and Shannon's information theory. Watch it; it explains the *why* far better than a README can.

All the ideas belong to David Shapiro and Anthropic. This repo only turns them into a checklist-and-templates kit anyone can copy. Numbers quoted here are Anthropic's own, reported in the video, and have not been independently verified.

## The idea in three pictures

**1. Writing code is no longer the scarce skill. Human attention is.**

```mermaid
flowchart LR
    U["UPSTREAM (humans)<br/>decide what to build<br/>specify it so a machine can check it"]
    W["WRITING CODE (agents)<br/>no longer the scarce skill"]
    D["DOWNSTREAM (humans)<br/>design the checks<br/>own the risk"]
    U --> W --> D
```

**2. Build the floor before you open the firehose.** You can only loosen human review when almost everything is reversible.

```mermaid
flowchart LR
    F["🚿 Agent output (the firehose)"] --> FLOOR
    subgraph FLOOR["The floor"]
        T["Tests an agent can run"]
        FF["Feature flags"]
        S["Staged releases"]
        R["Fast rollback"]
    end
```

**3. The end state: machines do the work, people hold what machines can't.**

```mermaid
flowchart TD
    subgraph People
        P1["Purpose"]
        P2["Trust"]
        P3["Accountability"]
    end
    People --> C
    A1["Audit agent: safety"] -.-> C
    A2["Audit agent: security"] -.-> C
    C["Coordinate"] --> M1["Manage"] & M2["Manage"]
    M1 --> S1["Supervise"] & S2["Supervise"]
    M2 --> S3["Supervise"] & S4["Supervise"]
    S1 --> W1["Work"] & W2["Work"]
    S2 --> W3["Work"] & W4["Work"]
    S3 --> W5["Work"] & W6["Work"]
    S4 --> W7["Work"] & W8["Work"]
```

## The board: real software you can use today

This is not just a document. The `lifecycle/` folder is **working software**: a local dashboard, a command-line tool and a Claude Code skill that run your own changes through the blueprint. Clone it, point it at your project, and Claude Code starts working through the pipeline while you watch and decide. It runs on your machine, needs only Node.js, and sends nothing anywhere unless you turn on the optional API mode.

**Claude Code does the work through a CLI; you watch and decide in a live dashboard.** Every step it takes (tests run, findings, fixes, approvals, rollouts) moves a card across the board in real time.

![The board in motion: changes flow through verify, AI review, security, CI, human approval and a staged rollout](docs/media/board-in-motion.gif)

*A simulated team of agents (`node lifecycle/demo.mjs`): a typo fix waits for the floor to be built before it can skip human review, a login change needs two human approvals, a coupon change hits the 3-round review limit and gets rethought, and a caching change is halted mid-ramp and rolled back.*

### What each view is for

| | |
|---|---|
| ![Needs you](docs/media/needs-you.png) | **Needs you.** The red badge counts what only a person can do right now: approvals, review loops that need a new approach, rollouts to watch. Click one to jump to it. |
| ![Next step](docs/media/next-step.png) | **Next step for Claude.** Every card tells you what to ask Claude next, with a Copy button. On a subscription you paste it into Claude Code; the yellow bar says what *you* should do. |
| ![Personal profile](docs/media/personal-profile.png) | **Personal or Team.** Switch in the top bar. The line under the title shows exactly how much review depth (and token spend) the profile uses. |
| ![Pipeline](docs/media/pipeline.png) | **Pipeline.** Every change moves through the six layers. Each card shows its risk tier, the human who owns it, AI review rounds (red after 3) and the exact thing blocking it. The live feed on the right shows who did what. |
| ![Approval](docs/media/approval-drawer.png) | **Human approval.** Click a card to see the real test output, every finding and how it was answered. Only a person in the GUI can approve: agent approvals are shown crossed out because they never count. |
| ![Decision map](docs/media/decisions.png) | **Decision map.** Drag each kind of decision to the attention it needs: no human, on the loop, in the loop, or licensed signature. |
| ![The floor](docs/media/floor.png) | **The floor.** The four planks. Until all four exist, every change needs at least one human, even tier 0. |
| ![Metrics](docs/media/metrics.png) | **Metrics.** Output vs revert rate (the guardrail) and how often the AI reviewer catches your past incidents. |
| ![Org](docs/media/org.png) | **Org.** The end-state org chart. Nodes light up as agents in each role act; people hold purpose, trust and accountability. |

### Quick start

Needs [Node.js](https://nodejs.org) 18 or newer. The board and CLI have no dependencies.

```bash
git clone https://github.com/CurioCrafter/future-software-lifecycle
cd future-software-lifecycle
node lifecycle/server.mjs --dir .lifecycle-demo
```

Open http://localhost:4317, then in a second terminal watch a simulated team:

```bash
node lifecycle/demo.mjs --dir .lifecycle-demo
```

**Use it on your own project:**

1. Copy the `lifecycle/` folder and `.claude/skills/lifecycle/` into your repo.
2. Pick a profile (see below):

```bash
node lifecycle/cli.mjs init --profile personal
```

3. Start the board and open http://localhost:4317:

```bash
node lifecycle/server.mjs
```

4. In Claude Code, in the same folder: *"Use the lifecycle skill to open a change for <what you want built>. I own it."* From then on, use the **Next step for Claude** prompt on each card, and the **Needs you** badge for your part.

### Personal or team

A solo developer shouldn't spend a company's review budget. Pick a profile with `init --profile`, switch any time from the top bar or with `node lifecycle/cli.mjs profile personal|team`.

| | **Personal** (one developer) | **Team** (a company) |
|---|---|---|
| Human approvals | You approve your own tier 1 and 2 changes after reading the evidence | 1 human for tier 1, 2 different humans for tier 2 |
| AI review | 1 reviewer, no vote | 3 reviewers + a separate voting pass |
| Model (API mode) | `claude-sonnet-5-5`, medium effort | `claude-opus-5-5`, high effort |
| Security review | Tier 2 changes only | Every change |
| Review round limit | 2 | 3 |
| Floor needed before tier 0 skips you | Tests + rollback (`git revert` counts) | All four planks |
| API calls per review round | 1 (2 on tier 2), on the cheaper model | 7: 3 reviewers, 3 voters, 1 security |

On a Claude subscription the skill follows the same profile: in personal mode Claude reviews the diff itself in one pass; in team mode it spawns reviewer subagents and has them vote.

### Built to be watched

The board animates what's happening so you can glance at it instead of reading logs:
- Cards **slide** between stages and **flash** when they change; the stage name pulses when a card arrives.
- A card **shakes** when Claude tries to advance it and a gate blocks it.
- **Toasts** pop up for what matters: a change needs your approval, a security finding, a ship, a rollback.
- KPI numbers **count up** when they change, the **Needs you** badge pulses, floor planks **drop into place** when built, decisions **glide** between columns when you drag them, and the org chart **lights up** the role that's acting.
- It respects your system's reduced-motion setting.

Keyboard: `Esc` closes panels. The filter box finds cards by title, owner or ID.

### Two ways to drive it

**1. Claude subscription (Claude Code, no extra cost).** The repo ships a Claude Code skill at [.claude/skills/lifecycle/SKILL.md](.claude/skills/lifecycle/SKILL.md). Claude Code picks it up automatically in this folder. You prompt each part and Claude does that stage, records it on the board, and stops:

| You say | Claude does |
|---|---|
| "Open a lifecycle change for adding CSV export. I own it." | Writes the spec and acceptance criteria, picks the risk tier, opens card C1 |
| "Build it and self-verify." | Makes the change, runs your tests through `cli.mjs evidence` so the real output is recorded |
| "Run the AI review round." | Reviews the diff (or spawns reviewer subagents that vote), records findings, fixes or closes each |
| "Security review and CI." | Records security findings (they block merge), runs your full check |
| "What's blocking C1?" | Reads the board. At approval it tells you to click Approve in the GUI: it cannot approve for you |
| "Ship it behind a flag and ramp." | Flags it, ramps 10% → 50% → 100%. You can halt the ramp from the GUI at any time |

**2. Claude API (pay per token, automated).** [lifecycle/autopilot.mjs](lifecycle/autopilot.mjs) runs layers 2 and 3 on your own API key: several reviewers hunt for bugs in parallel, a separate voting pass keeps only the findings most of them agree on, and a security reviewer runs last. Results land on the board. It never approves and never merges.

```bash
cd lifecycle && npm install && cd ..
export ANTHROPIC_API_KEY=sk-ant-...
node lifecycle/autopilot.mjs C1 --base main --test "npm test"
```

How deep it goes follows your profile: **personal** makes 1 Sonnet call per round (plus a security call on tier 2); **team** makes 3 Opus reviewer calls, 3 voting calls and a security call. Override with `--reviewers N` or `LIFECYCLE_MODEL=...`. Cost grows with the size of the diff.

### What the board enforces

- Agent approvals never count. Human approvals only come from the GUI.
- A change can't leave self-verify without a real, passing command run.
- Every finding must be fixed or closed with a reason. Open security findings block merge.
- After 3 AI review rounds, the change is blocked until the approach is rethought.
- Tier 0 skips human review only when the profile's floor is built (and, in team mode, the author is trusted).
- The merge queue re-checks every earlier gate before release.

The board is a local process guard, not a security boundary: anything that can write `.lifecycle/state.json` can change it. Real enforcement belongs in branch protection and your CI. Use the board to run and see the process.

## What's in this repo

| File | What it's for |
|---|---|
| [lifecycle/](lifecycle/) | The board: `server.mjs` (dashboard), `cli.mjs` (what Claude uses), `autopilot.mjs` (API mode), `demo.mjs`, `test.mjs`. |
| [.claude/skills/lifecycle/SKILL.md](.claude/skills/lifecycle/SKILL.md) | The Claude Code skill that teaches Claude to run each stage through the CLI. |
| [BLUEPRINT.md](BLUEPRINT.md) | The full playbook: the six verification layers, risk tiers, the two non-negotiable rules, the floor, and the org model. |
| [templates/decision-map.md](templates/decision-map.md) | Map every decision to no human / on the loop / in the loop / licensed signature. |
| [templates/readiness-checklist.md](templates/readiness-checklist.md) | Score your team before you loosen review. Start here. |
| [templates/risk-tiers.yml](templates/risk-tiers.yml) | Copy and edit: which paths/changes need 0, 1 or 2 human approvals. |
| [templates/AGENTS.md](templates/AGENTS.md) | Rules to drop into your repo for coding agents (verify before claiming done, review loop limit, ownership). |
| [templates/pull_request_template.md](templates/pull_request_template.md) | PR template: evidence, risk tier, accountable human, rollback plan. |
| [templates/incident-to-test.md](templates/incident-to-test.md) | Turn every past incident into a test your AI reviewer is scored on daily. |

## How to adopt it

1. Fill in the [readiness checklist](templates/readiness-checklist.md). If you can't roll back a bad deploy in under an hour, **stop there and build the floor first.**
2. Copy `templates/AGENTS.md` and `templates/pull_request_template.md` into your repo (`.github/pull_request_template.md`).
3. Write your `risk-tiers.yml`. Start strict: everything is tier 2 until the evidence says otherwise.
4. Track two numbers weekly: **merged PRs** and **revert/incident rate**. Loosen a tier only when output goes up *and* reverts don't.

## License

Docs and templates: [CC BY 4.0](LICENSE). Copy, adapt and share, including commercially, as long as you credit this repo and David Shapiro's video. Code in `lifecycle/`: [MIT](lifecycle/LICENSE).

This is a community project. It is not made or endorsed by Anthropic or David Shapiro.
