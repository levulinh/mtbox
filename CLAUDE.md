# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

MTBox is the **orchestration infrastructure** for an AI-powered software company. It manages four autonomous Claude Code agents (PM, Designer, Programmer, QA) that collaborate to build software products via Linear and GitHub. This repo is not a product — it's the scaffolding that runs the agents.

The actual product repo is at `/Volumes/ex-ssd/workspace/mtbox-app` (GitHub: `levulinh/mtbox-app`).

## Key Commands

```bash
# Check all agent statuses + last run times
bash scripts/agent-status.sh

# Watch live logs for all agents (color-coded)
bash scripts/watch-agents.sh

# Watch a single agent
bash scripts/watch-agents.sh pm   # or cto, designer, programmer, qa

# Manually trigger an agent run
bash scripts/run-pm.sh
bash scripts/run-designer.sh
bash scripts/run-programmer.sh
bash scripts/run-qa.sh
bash scripts/run-cto.sh

# Start the dashboard (if not running via launchd)
bin/mtbox-dashboard
# Dashboard available at http://localhost:4242

# Check launchd job status
launchctl list | grep mtbox
```

## Architecture

### Agent Execution Model

Each `scripts/run-{agent}.sh` script:
1. Checks for a lock file (`status/{agent}.lock`) — exits immediately if the agent is already running
2. Writes its PID to the lock file and `"busy"` to `status/{agent}.status`
3. Invokes `claude --print --output-format stream-json` with the agent's prompt from `agents/{agent}-prompt.md`
4. Pipes output through `scripts/claude-stream.js` (which parses stream-json and emits human-readable tool calls + final result)
5. Appends everything to `logs/{agent}.log`
6. On exit (success or error), removes the lock and writes `"idle"` to the status file

### Dashboard (`dashboard/`)

Node.js HTTP server on port 4242:
- `GET /api/status` — reads all `status/{agent}.status` and `.lock` files via `dashboard/status.js`
- `GET /logs/{agent}` — SSE stream via `tail -f` on `logs/{agent}.log`
- `POST /trigger/{agent}` — spawns `scripts/run-{agent}.sh` in the background
- `POST /webhook/linear` — receives Linear webhook events, triggers agents on status transitions
- `GET /` — serves `dashboard/index.html`

The dashboard is kept alive by launchd via `scripts/com.mtbox.dashboard.plist` (label: `com.mtbox.dashboard`).

### Linear Webhook Integration

When an issue changes status in Linear, a webhook triggers the corresponding agent immediately (instead of waiting for the next polling cycle):

| Status Transition | Agent Triggered |
|---|---|
| → In Design | Designer |
| → In Progress | Programmer |
| → In Review | QA |

**How it works:**
1. `scripts/start-tunnel.sh` starts a Cloudflare quick tunnel exposing the dashboard to the internet
2. On startup, the script registers/updates a Linear webhook pointing to the tunnel URL (`/webhook/linear`)
3. The webhook ID is persisted at `~/.mtbox/linear-webhook-id` so restarts update rather than duplicate
4. The dashboard verifies webhook signatures using HMAC SHA-256 with a shared secret
5. Polling schedules remain as a safety net for missed webhooks

**Env vars (set in launchd plists):**
- `LINEAR_API_KEY` — Personal API key (in tunnel plist only)
- `LINEAR_WEBHOOK_SECRET` — shared HMAC secret (in both dashboard and tunnel plists)

**Launchd services:**
- `com.mtbox.tunnel` — runs `~/.mtbox/start-tunnel.sh`, auto-restarts, updates Linear webhook URL on each start
- Tunnel URL changes on restart (quick tunnel); the script handles re-registration automatically

**Useful commands:**
```bash
# Check current tunnel URL
cat /tmp/mtbox-tunnel.log | grep "Tunnel URL" | tail -1

# Check tunnel status
launchctl list | grep com.mtbox.tunnel

# View webhook logs
cat /tmp/mtbox-dashboard.log | grep webhook
```

### Agent Coordination

Agents don't talk to each other directly. Coordination happens through:
- **Linear** — issue status transitions, comments (all agents, prefixed with `[PM]`, `[Designer]`, etc.)
- **GitHub** — code, PRs (`mtbox-app` repo)
- `/Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md` — shared cross-agent conventions
- Per-agent persistent memory (see below)

### Agent Memory Convention

Memory is split by concern:

| Agent | Memory file | Repo | Why |
|---|---|---|---|
| CTO | `docs/memory/cto-memory.md` | `mtbox` (this repo) | Orchestration state: product registry, report counter |
| PM | `docs/memory/pm-memory.md` | `mtbox-app` | Product state: routing decisions, issue patterns |
| Designer | `docs/memory/designer-memory.md` | `mtbox-app` | Product state: design palette, component decisions |
| Programmer | `docs/memory/programmer-memory.md` | `mtbox-app` | Product state: architecture decisions, packages |
| QA | `docs/memory/qa-memory.md` | `mtbox-app` | Product state: test patterns, known flaky areas |

When a new product is added, its product repo gets its own `docs/memory/` folder — each product has independent PM/Designer/Programmer/QA memories so design decisions and code patterns don't bleed across products.

### Scheduling

Agents are triggered in two ways: **Linear webhooks** (immediate, on status change) and **polling** (safety net).

| Agent | Webhook Trigger | Polling Fallback | Location |
|---|---|---|---|
| PM | — | Every 15 min via RemoteTrigger | Cloud |
| CTO | — | Every 2 hours via RemoteTrigger | Cloud |
| Designer | Issue → "In Design" | Every 30 min via launchd | Local Mac |
| Programmer | Issue → "In Progress" | Every 30 min via RemoteTrigger | Cloud |
| QA | Issue → "In Review" | Every 30 min via launchd | Local Mac |

Local agents and the webhook tunnel require the Mac to stay awake (System Settings → Energy Saver → prevent sleep).

### Agent Behavior

- **Designer and Programmer** work on **one issue at a time** (oldest first). Remaining issues are picked up in subsequent runs.

### CTO Agent

Sits between the CEO and PM. Reads new directives from the "CTO Directives" Linear project, generates `docs/cto-roadmap.md` in each product repo, and creates feature tasks in product Backlogs (PM picks up from there). Tracks a `turns_since_last_report` counter in `docs/memory/cto-memory.md` (orchestration repo) and reports back to CEO via Linear comment when a phase completes, a blocker is detected, the roadmap is exhausted, or 5 runs (~10 hours) pass without a report.

### Linear Constants

- MTBox team ID: `86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad`
- Campaign Tracker project ID: `d7b5fab6-e39b-4933-bbab-1ee32c360d83`
- CEO (Drew) Linear user ID: `adcd822a-946e-4d74-9c0b-1f55e274706b` / username: `levulinhkr`

### Workflow Statuses

`Backlog` → `In Design` → `Awaiting Design Approval` → `In Progress` → `In Review` → `Awaiting Decision` → `Done`

Only the PM agent moves issues between statuses.

## File Layout

```
agents/         Agent prompts (pm-prompt.md, designer-prompt.md, etc.)
bin/            mtbox-dashboard wrapper script
dashboard/      Node.js dashboard server (server.js, status.js, index.html)
logs/           Per-agent log files ({agent}.log)
scripts/        Run scripts, watch script, stream parser, launchd plists, tunnel script
status/         Lock files ({agent}.lock) and status files ({agent}.status)
docs/memory/    Per-agent persistent memory files (cto-memory.md, etc.)
docs/           Design specs and implementation plans
~/.mtbox/       Tunnel script copy + Linear webhook ID (outside repo, accessible by launchd)
```
