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
- `GET /` — serves `dashboard/index.html`

The dashboard is kept alive by launchd via `scripts/com.mtbox.dashboard.plist` (label: `com.mtbox.dashboard`).

### Agent Coordination

Agents don't talk to each other directly. Coordination happens through:
- **Linear** — issue status transitions (PM-only), comments (all agents, prefixed with `[PM]`, `[Designer]`, etc.)
- **GitHub** — code, PRs (`mtbox-app` repo)
- `/Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md` — shared cross-agent conventions
- `/Volumes/ex-ssd/workspace/mtbox-app/docs/memory/{agent}-memory.md` — per-agent persistent memory

### Scheduling

| Agent | Trigger | Location |
|---|---|---|
| PM | Every 15 min via Claude Code RemoteTrigger | Cloud |
| CTO | Every 2 hours via Claude Code RemoteTrigger | Cloud |
| Designer | Every 30 min via macOS launchd | Local Mac |
| Programmer | Every 30 min via Claude Code RemoteTrigger | Cloud |
| QA | Every 30 min via macOS launchd | Local Mac |

Local agents require the Mac to stay awake (System Settings → Energy Saver → prevent sleep).

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
scripts/        Run scripts, watch script, stream parser, launchd plist
status/         Lock files ({agent}.lock) and status files ({agent}.status)
docs/memory/    Per-agent persistent memory files (cto-memory.md, etc.)
docs/           Design specs and implementation plans
```
