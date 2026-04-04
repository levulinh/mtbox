# Dashboard Redesign

**Date:** 2026-04-04
**Author:** Drew (CEO) + Claude
**Status:** Approved

---

## Overview

Redesign the MTBox agent dashboard (`dashboard/index.html` + `dashboard/server.js`) to make agents visually distinct and improve log readability. Two changes: (1) card grid layout with per-agent color and identity, (2) log panel scoped to a single run with a run history browser.

---

## Agent Identity

Each agent has a fixed color, emoji, and role label used throughout the UI:

| Agent | Color | Hex | Emoji | Role Label |
|---|---|---|---|---|
| PM | Blue | `#3b82f6` | 📋 | Workflow orchestration |
| CTO | Cyan | `#06b6d4` | 🏗️ | Strategic planning |
| Designer | Magenta | `#a855f7` | 🎨 | UI mockups |
| Programmer | Green | `#22c55e` | 💻 | Implementation |
| QA | Yellow | `#eab308` | 🧪 | Testing |

These colors are consistent with the `watch-agents.sh` terminal color scheme (adapted from ANSI to hex).

---

## Layout: Card Grid

### Desktop (≥768px)

- Cards fill the full viewport width in a **3-column CSS grid**
- Below the grid: a full-width **log panel** that appears when a card is selected
- Clicking a card selects it (highlighted border) and opens its log below
- All 5 cards always visible simultaneously

### Mobile (<768px)

- Cards stack in a **single column**
- Tapping a card toggles an inline log panel directly below that card
- Same behavior as current mobile expand/collapse

### Card anatomy

```
┌─────────────────────────────────┐
│ ▌ [colored 4px left border]     │
│                          [Run ▶]│
│ 📋 PM              [IDLE badge] │
│ Workflow orchestration          │
│ ⏱ next in 4:32                 │
│ ─────────────────────────────── │
│ ✓ Processed 3 backlog issues    │
└─────────────────────────────────┘
```

- **4px left border** in the agent's color (always visible, indicates identity at a glance)
- **Emoji + name** on the same line, large enough to read quickly
- **Role label** below the name in a muted smaller font
- **Status badge** top-right area (IDLE / BUSY / ERROR / NEVER)
- **Run button** top-right corner, disabled when busy
- **Timer** below the badge
- **Last summary** at the bottom, dimmed
- **Selected state**: card border becomes full-color highlight on all 4 sides, background slightly tinted with agent color

---

## Log Panel: Run Separation

### Current behavior (to replace)

The existing SSE stream tails the last 50 lines of the log file continuously, mixing all historical runs together.

### New behavior

**The log panel shows one run at a time.**

#### Live mode (default, current run)

- SSE stream starts from the last `=== Agent starting ===` line in the log file, not from a fixed 50-line offset
- Auto-scrolls as new lines arrive
- Shows "● Live" indicator in the panel header

#### History mode (previous runs)

- Clicking ← in the run picker switches to a previous run
- Fetches static text from `GET /logs/{agent}/runs/{index}`
- No SSE — static render, no auto-scroll
- Shows run timestamp in the header

#### Run picker UI

```
[← Prev]  Run 5 — Apr 4, 14:32  [Latest →]
```

- Appears only when there are 2+ runs recorded
- "Latest →" is greyed out when already on the latest run
- "← Prev" is greyed out on the oldest run (run 0 = "Legacy — before Apr 4")

---

## Backend Changes (`server.js`)

### New: `GET /logs/{agent}/runs`

Scans the full log file. Splits on `=== Agent starting ===` lines. Returns JSON (latest first):

```json
[
  { "index": 5, "startedAt": "2026-04-04T14:32:00", "summary": "Processed 3 issues" },
  { "index": 4, "startedAt": "2026-04-04T12:15:00", "summary": "No new issues" },
  { "index": 0, "startedAt": null, "summary": "Legacy" }
]
```

- Index 0 = everything before the first `=== starting ===` line (may be empty)
- `summary` = first non-timestamp line after `Done.` in that run (same logic as `parseLastSummary`)
- `startedAt` = ISO timestamp parsed from the `=== Agent starting ===` line

### New: `GET /logs/{agent}/runs/{index}`

Returns the plain text content of run `{index}` (the lines between that run's `=== starting ===` and the next one). `Content-Type: text/plain`.

### Modified: `GET /logs/{agent}` (SSE)

Instead of `tail -n 50 -f`, find the byte offset of the last `=== Agent starting ===` line and tail from there:

```js
// Find line number of last run start
const lines = logContent.split('\n');
let startLine = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  if (STARTING_RE.test(lines[i])) { startLine = i; break; }
}
// tail -n +{startLine+1} -f logFile
const tail = spawn('tail', ['-n', `+${startLine + 1}`, '-f', logFile]);
```

If no `=== starting ===` found (never run), fall back to `tail -n 50 -f` (existing behavior).

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/index.html` | Full layout rewrite: card grid, new log panel with run picker |
| `dashboard/server.js` | Two new endpoints, modified SSE tail logic |

No changes to `status.js`, agent scripts, or any other files.

---

## Out of Scope

- Dark mode toggle
- Agent configuration from the UI
- Per-run log files on disk (logs remain single-file, split is done at read time)
- Run deletion or archiving
