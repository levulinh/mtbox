# Agent Dashboard — Design Spec
**Date:** 2026-04-04  
**Status:** Approved

## Overview

A lightweight web dashboard for monitoring and controlling the 4 MTBox agents (PM, Designer, Programmer, QA). Runs as a persistent background service accessible from any device on the local network, including mobile.

---

## Architecture

```
dashboard/
  server.js      ← single Node.js file, no framework, ~200 lines
  index.html     ← full responsive UI, vanilla JS
~/Library/LaunchAgents/com.mtbox.dashboard.plist
```

### Server

- Pure Node.js, no npm dependencies, no build step
- Binds to `0.0.0.0:4242` — accessible on the local network
- Managed by launchd (`com.mtbox.dashboard.plist`), `RunAtLoad true`, same pattern as existing agent plists
- No authentication — LAN-only access is acceptable

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Serves `index.html` |
| `/api/status` | GET | JSON: all 4 agents' state, last run time, next-run countdown, last task summary |
| `/logs/:agent` | GET | SSE stream — `tail -f` on the agent's log file |
| `/trigger/:agent` | POST | Spawns the agent's existing `run-*.sh` script in background |

---

## Agent Status (derived from existing files, no new state)

For each agent, the server reads:

| Field | Source |
|---|---|
| `status` | `.status` file (`idle`/`busy`/`error`) + `.lock` file presence |
| `pid` | Contents of `.lock` file (present only when busy) |
| `lastRunAt` | Parse `=== X Agent starting ===` timestamp from log file |
| `nextRunIn` | `900 - (now - lastRunAt)` seconds (15-min launchd interval) |
| `lastSummary` | Text between last `starting ===` and `Done.` in the log |

---

## UI

### Responsive layout

- **Mobile (< 768px):** Compact rows stacked vertically. Tap a row to expand its live log panel below it. Busy agent auto-expands on load.
- **Desktop (≥ 768px):** Split layout — agent list on the left (260px), full log detail panel on the right. Clicking an agent row switches the detail view.

### Agent row (shared between both layouts)

Each row shows:
- Agent name (uppercase monospace)
- Status badge: `IDLE` (green) / `BUSY` (yellow) / `ERROR` (red)
- Left border accent: yellow for busy, red for error
- Countdown timer: `⏱ next in MM:SS` (idle) or `⏱ running MM:SS` (busy)
- Task preview: last summary line from log, prefixed `✓` (idle) or `✗` (error)
- **▶ Run** button — disabled while agent is busy

### Log panel

- Dark terminal background (`#141414`), monospaced, 10–11px
- Streams via SSE (`/logs/:agent`) — new lines appear in real-time
- Only one SSE connection open at a time (switched on row select)
- Timestamp columns dim (`#555`), content lines normal, keywords highlighted in blue/green/yellow

### Styling

Light brutalism: `#f5f0e8` background, `2–3px solid #111` borders, `box-shadow: 3px–6px 0 #111`, `Courier New` / monospace throughout. Black header bar. No rounded corners.

---

## Real-time Updates

- `/api/status` polled every **5 seconds** — refreshes badges, timers, task previews
- SSE log stream opens on row select, closes on deselect
- Countdown timers tick client-side every second, resynced on each `/api/status` poll

---

## Triggering an Agent

`POST /trigger/:agent` validates the agent name, then calls `spawn('bash', ['/path/to/run-agent.sh'])` with `detached: true`. Returns `{ ok: true }` immediately. The run script's own lock mechanism prevents double-runs — the dashboard button is also disabled client-side while status is `busy`.

---

## launchd Integration

New plist at `~/Library/LaunchAgents/com.mtbox.dashboard.plist`:

```xml
<key>Label</key><string>com.mtbox.dashboard</string>
<key>ProgramArguments</key>
<array><string>/usr/bin/node</string><string>/Volumes/ex-ssd/workspace/mtbox/dashboard/server.js</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
```

`KeepAlive true` ensures the server restarts if it crashes. Unlike the agent plists, no `StartInterval` — the dashboard runs continuously.
