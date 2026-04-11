# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## What This Repo Is

MTBox is **orchestration infrastructure** for AI-powered software company. Manages 3 autonomous Claude Code agents (PM, Designer, Programmer) + CTO agent. Collaborate via Linear + GitHub. Not product — scaffolding that runs agents.

Product repo at `/Volumes/ex-ssd/workspace/mtbox-app` (GitHub: `levulinh/mtbox-app`).

## Key Commands

```bash
# Check all agent statuses + last run times
bash scripts/agent-status.sh

# Watch live logs for all agents (color-coded)
bash scripts/watch-agents.sh

# Watch a single agent
bash scripts/watch-agents.sh pm   # or cto, designer, programmer

# Manually trigger an agent run
bash scripts/run-pm.sh
bash scripts/run-designer.sh
bash scripts/run-programmer.sh
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
1. Checks lock file (`status/{agent}.lock`) — exits if agent already running
2. Writes PID to lock file and `"busy"` to `status/{agent}.status`
3. **Pre-check** (token-saving): unless `.mention` file exists or `MTBOX_SKIP_PRECHECK=1`, calls `scripts/linear-precheck.sh` to query Linear. No issues → logs "No work found", exits without Claude. Webhook runs set `MTBOX_SKIP_PRECHECK=1` to bypass (work guaranteed).
3. Invokes `claude --print --output-format stream-json` with agent's prompt from `agents/{agent}-prompt.md`
4. Pipes through `scripts/claude-stream.js` (parses stream-json, emits human-readable tool calls + result)
5. Appends to `logs/{agent}.log`
6. On exit, removes lock, writes `"idle"` to status file

### Dashboard (`dashboard/`)

Node.js HTTP server on port 4242:
- `GET /api/status` — reads all `status/{agent}.status` and `.lock` files via `dashboard/status.js`
- `GET /logs/{agent}` — SSE stream via `tail -f` on `logs/{agent}.log`
- `POST /trigger/{agent}` — spawns `scripts/run-{agent}.sh` in background
- `POST /webhook/linear` — receives Linear webhook events, triggers agents on status transitions
- `GET /` — serves `dashboard/index.html`

Dashboard kept alive by launchd via `scripts/com.mtbox.dashboard.plist` (label: `com.mtbox.dashboard`).

### Linear Webhook Integration

Issue status change in Linear triggers corresponding agent immediately (no polling wait):

| Status Transition | Agent Triggered |
|---|---|
| → In Design | Designer |
| → Awaiting Design Approval | CTO (or auto-approved if Design Clearance) |
| → In Progress | Programmer |
| → Done | CTO (roadmap sync) |

**Auto-approval**: Designer posts "Design Clearance" card (code-only, no visual design) → dashboard auto-approves without CTO Sonnet. Posts scripted CTO comment, moves to "In Progress".

**How it works:**
1. `scripts/start-tunnel.sh` starts Cloudflare quick tunnel exposing dashboard to internet
2. On startup, registers/updates Linear webhook pointing to tunnel URL (`/webhook/linear`)
3. Webhook ID persisted at `~/.mtbox/linear-webhook-id` so restarts update, not duplicate
4. Dashboard verifies webhook signatures via HMAC SHA-256
5. Polling stays as safety net for missed webhooks

**Env vars (set in launchd plists):**
- `LINEAR_API_KEY` — Personal API key (in tunnel plist only)
- `LINEAR_WEBHOOK_SECRET` — shared HMAC secret (in both dashboard and tunnel plists)

**Launchd services:**
- `com.mtbox.tunnel` — runs `~/.mtbox/start-tunnel.sh`, auto-restarts, updates Linear webhook URL on each start
- Tunnel URL changes on restart (quick tunnel); script handles re-registration.

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

Agents no direct talk. Coordinate via:
- **Linear** — issue status transitions, comments (all agents, prefixed with `[PM]`, `[Designer]`, `[Programmer]`, `[CTO]`)
- **GitHub** — code, PRs (`mtbox-app` repo)
- `/Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md` — shared cross-agent conventions
- Per-agent persistent memory (see below)

### Agent Memory Convention

Memory split by concern:

| Agent | Memory file | Repo | Why |
|---|---|---|---|
| CTO | `docs/memory/cto-memory.md` | `mtbox` (this repo) | Orchestration state: product registry, report counter (~20 lines) |
| CTO | `docs/memory/cto-run-log.md` | `mtbox` (this repo) | Append-only audit trail — never read by agents |
| PM | `docs/memory/pm-memory.md` | `mtbox-app` | Product state: routing decisions, issue patterns |
| Designer | `docs/memory/designer-memory.md` | `mtbox-app` | Product state: design palette, component decisions |
| Programmer | `docs/memory/programmer-memory.md` | `mtbox-app` | Product state: architecture decisions, packages, test patterns |

**Memory philosophy**: Memory files = **living knowledge bases**, not run journals. Agents update facts in-place, never append per-run logs. CTO memory split: live state (~20 lines, read by all) + `cto-run-log.md` (append-only audit, never read by agents). Product memories target 60-100 lines, distilled knowledge only: design rules, arch decisions, routing patterns, CEO prefs.

New product → own `docs/memory/` folder. Independent PM/Designer/Programmer memories prevent bleed across products.

### Scheduling

Agents triggered only by **Linear webhooks** via **queue + rest timer**. No polling — all triggers from webhooks or manual dashboard.

| Agent | Model | Webhook Trigger | Location |
|---|---|---|---|
| PM | Haiku | Issue created | Local Mac |
| CTO | Sonnet | Issue → "Awaiting Design Approval" or "Done" | Local Mac |
| Designer | Sonnet | Issue → "In Design" | Local Mac |
| Programmer | Sonnet | Issue → "In Progress" | Local Mac |

**Queue + Rest Timer**: Webhook fires → event enqueued for agent. Idle + not resting → runs immediately. After run, agent rests (default: 15 min) before next. Prevents token burn from rapid triggers, keeps latency reasonable.

- **Rest timer** configurable from dashboard header (0–120 min)
- **Manual triggers** and **@mentions** skip rest timer
- **Skip rest** button on agent card to force-run immediately
- **Queue** visible on agent card with clear button
- Queued events coalesced: agent checks Linear for all pending work on run

Local agents + tunnel require Mac awake (System Settings → Energy Saver → prevent sleep).

### Agent Behavior

**Designer and Programmer** work one issue at time (oldest first). Remaining picked up in subsequent runs.

### CTO Agent

Sits between CEO + PM. Reads directives from "CTO Directives" Linear project, generates `docs/cto-roadmap.md` per product repo, creates feature tasks in Backlogs. Tracks `turns_since_last_report` in `docs/memory/cto-memory.md`. Reports to CEO via Linear comment when: phase complete, blocker detected, roadmap exhausted, or 5 runs (~10 hours) without report.

### Linear Constants

- MTBox team ID: `86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad`
- Campaign Tracker project ID: `d7b5fab6-e39b-4933-bbab-1ee32c360d83`
- CEO (Drew) Linear user ID: `adcd822a-946e-4d74-9c0b-1f55e274706b` / username: `levulinhkr`

### Workflow Statuses

`Backlog` → `In Design` → `Awaiting Design Approval` → `In Progress` → `Done`

Side status: `Awaiting Decision` (for issues needing CEO input at any stage).

Programmer handles full implementation-to-ship: code, tests, self-review, PR merge, moves to Done. No QA handoff.

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

## graphify

Project has graphify knowledge graph at graphify-out/.

Rules:
- Before arch/codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes + community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep graph current