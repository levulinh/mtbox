# Agent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive web dashboard (phone + desktop) that shows live status, logs, and countdown timers for the 4 MTBox agents, and lets you trigger any agent instantly.

**Architecture:** Pure Node.js HTTP server (no npm, no build step) serving a single responsive HTML page. Status is derived entirely from existing `.status`, `.lock`, and `.log` files — no new state. Log streaming uses SSE (`tail -f`). Runs as a persistent launchd service on `0.0.0.0:4242`.

**Tech Stack:** Node.js v25 stdlib only (`node:http`, `node:fs`, `node:child_process`, `node:path`). Vanilla JS + CSS on the frontend. `node:test` + `node:assert` for unit tests.

---

## File Map

| File | Role |
|---|---|
| `dashboard/status.js` | Pure functions: read agent status from files, parse log timestamps and summaries |
| `dashboard/server.js` | HTTP server: routes, SSE streaming, trigger spawning |
| `dashboard/index.html` | Full responsive UI: HTML + CSS + vanilla JS |
| `dashboard/test/status.test.js` | Unit tests for `status.js` using `node:test` |
| `~/Library/LaunchAgents/com.mtbox.dashboard.plist` | launchd service definition |

---

## Task 1: Scaffold and server skeleton

**Files:**
- Create: `dashboard/status.js`
- Create: `dashboard/server.js`
- Create: `dashboard/index.html`
- Create: `dashboard/test/status.test.js`

- [ ] **Step 1: Create the directory and placeholder files**

```bash
mkdir -p /Volumes/ex-ssd/workspace/mtbox/dashboard/test
touch /Volumes/ex-ssd/workspace/mtbox/dashboard/status.js
touch /Volumes/ex-ssd/workspace/mtbox/dashboard/index.html
touch /Volumes/ex-ssd/workspace/mtbox/dashboard/test/status.test.js
```

- [ ] **Step 2: Write `server.js` — minimal HTTP server that serves `index.html`**

```js
// dashboard/server.js
'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const PORT    = process.env.PORT || 4242;
const HOST    = '0.0.0.0';
const DASH_DIR = __dirname;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/') {
    return serveFile(res, path.join(DASH_DIR, 'index.html'));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});
```

- [ ] **Step 3: Write a minimal `index.html` to verify the server works**

```html
<!-- dashboard/index.html -->
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>MTBox Agents</title></head>
<body><h1>MTBox Agents</h1><p>Dashboard loading...</p></body>
</html>
```

- [ ] **Step 4: Start the server and verify it responds**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
curl -s http://localhost:4242/ | grep "MTBox"
kill %1
```

Expected output: `<h1>MTBox Agents</h1>`

- [ ] **Step 5: Commit**

```bash
git add dashboard/
git commit -m "feat: scaffold dashboard directory and server skeleton"
```

---

## Task 2: Status parsing module (TDD)

**Files:**
- Modify: `dashboard/status.js`
- Modify: `dashboard/test/status.test.js`

Constants used throughout this task:
```
BASE_DIR  = /Volumes/ex-ssd/workspace/mtbox
AGENTS    = ['pm', 'designer', 'programmer', 'qa']
LOG_DIR   = BASE_DIR/logs
STATUS_DIR = BASE_DIR/status
SCRIPTS_DIR = BASE_DIR/scripts
```

- [ ] **Step 1: Write failing tests for `parseLastRunAt`**

```js
// dashboard/test/status.test.js
'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { parseLastRunAt, parseLastSummary } = require('../status.js');

test('parseLastRunAt returns null for empty log', () => {
  assert.equal(parseLastRunAt(''), null);
});

test('parseLastRunAt extracts timestamp from last starting line', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\nsome output\n[2026-04-04 01:37:42] Done.\n`;
  const result = parseLastRunAt(log);
  assert.equal(result, new Date('2026-04-04T01:36:13').getTime());
});

test('parseLastRunAt picks the LAST starting line when multiple runs exist', () => {
  const log = [
    '[2026-04-03 10:00:00] === PM Agent starting ===',
    'first run output',
    '[2026-04-03 10:01:00] Done.',
    '[2026-04-04 01:36:13] === PM Agent starting ===',
    'second run output',
    '[2026-04-04 01:37:42] Done.',
  ].join('\n');
  const result = parseLastRunAt(log);
  assert.equal(result, new Date('2026-04-04T01:36:13').getTime());
});

test('parseLastSummary returns null for empty log', () => {
  assert.equal(parseLastSummary(''), null);
});

test('parseLastSummary returns first non-empty line between starting and Done', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\n\nRun complete. Here's the summary:\n- MTB-6 moved to In Design\n[2026-04-04 01:37:42] Done.\n`;
  const result = parseLastSummary(log);
  assert.equal(result, "Run complete. Here's the summary:");
});

test('parseLastSummary returns null if no Done line follows starting line', () => {
  const log = `[2026-04-04 01:36:13] === PM Agent starting ===\nstill running\n`;
  assert.equal(parseLastSummary(log), null);
});
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node --test dashboard/test/status.test.js
```

Expected: 5 failures (`parseLastRunAt is not a function` etc.)

- [ ] **Step 3: Implement `status.js` — parsing functions**

```js
// dashboard/status.js
'use strict';
const fs   = require('node:fs');
const path = require('node:path');

const BASE_DIR   = '/Volumes/ex-ssd/workspace/mtbox';
const LOG_DIR    = path.join(BASE_DIR, 'logs');
const STATUS_DIR = path.join(BASE_DIR, 'status');
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const AGENTS     = ['pm', 'designer', 'programmer', 'qa'];
const INTERVAL   = 900; // seconds

// Regex: matches "[2026-04-04 01:36:13] === X Agent starting ==="
const STARTING_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] === \w+ Agent starting ===/m;
const DONE_RE     = /\] Done\.\s*$/m;

function parseLastRunAt(logContent) {
  if (!logContent) return null;
  const lines = logContent.split('\n');
  let lastMatch = null;
  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] === \w+ Agent starting ===/);
    if (m) lastMatch = m[1];
  }
  if (!lastMatch) return null;
  return new Date(lastMatch.replace(' ', 'T')).getTime();
}

function parseLastSummary(logContent) {
  if (!logContent) return null;
  const lines = logContent.split('\n');
  let startIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/=== \w+ Agent starting ===/.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) return null;
  const doneIdx = lines.findIndex((l, i) => i > startIdx && /\] Done\./.test(l));
  if (doneIdx === -1) return null;
  for (let i = startIdx + 1; i < doneIdx; i++) {
    const trimmed = lines[i].trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function readAgentStatus(name) {
  const statusFile = path.join(STATUS_DIR, `${name}.status`);
  const lockFile   = path.join(STATUS_DIR, `${name}.lock`);
  const logFile    = path.join(LOG_DIR, `${name}.log`);

  const hasLock = fs.existsSync(lockFile);
  const pid     = hasLock ? parseInt(fs.readFileSync(lockFile, 'utf8').trim(), 10) : null;

  let statusRaw = 'never';
  try { statusRaw = fs.readFileSync(statusFile, 'utf8').trim(); } catch {}

  const status = hasLock ? 'busy' : (statusRaw === 'error' ? 'error' : statusRaw === 'idle' ? 'idle' : 'never');

  let logContent = '';
  try { logContent = fs.readFileSync(logFile, 'utf8'); } catch {}

  const lastRunAt  = parseLastRunAt(logContent);
  const nowSec     = Math.floor(Date.now() / 1000);
  const lastRunSec = lastRunAt ? Math.floor(lastRunAt / 1000) : null;
  const nextRunIn  = lastRunSec ? Math.max(0, INTERVAL - (nowSec - lastRunSec)) : null;

  return {
    name,
    status,
    pid,
    lastRunAt,
    nextRunIn,
    lastSummary: parseLastSummary(logContent),
    scriptPath: path.join(SCRIPTS_DIR, `run-${name}.sh`),
  };
}

function getAllAgentStatuses() {
  return AGENTS.map(readAgentStatus);
}

module.exports = { parseLastRunAt, parseLastSummary, readAgentStatus, getAllAgentStatuses, AGENTS };
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node --test dashboard/test/status.test.js
```

Expected: `5 pass, 0 fail`

- [ ] **Step 5: Smoke-test against real files**

```bash
node -e "const s = require('./dashboard/status.js'); console.log(JSON.stringify(s.getAllAgentStatuses(), null, 2))"
```

Expected: JSON array with 4 agents, `pm` showing `status: "idle"`, non-null `lastRunAt` and `lastSummary`.

- [ ] **Step 6: Commit**

```bash
git add dashboard/status.js dashboard/test/status.test.js
git commit -m "feat: add agent status parsing module with tests"
```

---

## Task 3: `/api/status` endpoint

**Files:**
- Modify: `dashboard/server.js`

- [ ] **Step 1: Add the `/api/status` route to `server.js`**

Replace the `const server = http.createServer(...)` block with:

```js
// dashboard/server.js  (add near top)
const { getAllAgentStatuses } = require('./status.js');

// ... (keep serveFile function as-is) ...

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/') {
    return serveFile(res, path.join(DASH_DIR, 'index.html'));
  }

  if (method === 'GET' && url === '/api/status') {
    const agents = getAllAgentStatuses();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ agents, serverTime: Date.now() }));
  }

  res.writeHead(404);
  res.end('Not found');
});
```

- [ ] **Step 2: Start server and verify endpoint**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
curl -s http://localhost:4242/api/status | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.agents.map(a=>a.name+':'+a.status).join(', '))"
kill %1
```

Expected output: `pm:idle, designer:idle, programmer:idle, qa:idle`

- [ ] **Step 3: Commit**

```bash
git add dashboard/server.js
git commit -m "feat: add /api/status endpoint"
```

---

## Task 4: SSE log streaming (`GET /logs/:agent`)

**Files:**
- Modify: `dashboard/server.js`

- [ ] **Step 1: Add `child_process` import and the `/logs/:agent` route**

Add to the top of `server.js`:
```js
const { spawn } = require('node:child_process');
```

Add this route inside `http.createServer`, before the final 404:

```js
  const logMatch = url.match(/^\/logs\/([a-z]+)$/);
  if (method === 'GET' && logMatch) {
    const agent = logMatch[1];
    const { AGENTS } = require('./status.js');
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }

    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;

    // Create file if it doesn't exist so tail -f doesn't error
    const fsSync = require('node:fs');
    if (!fsSync.existsSync(logFile)) fsSync.writeFileSync(logFile, '');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');

    const tail = spawn('tail', ['-n', '50', '-f', logFile]);

    tail.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) res.write(`data: ${line}\n\n`);
      }
    });

    req.on('close', () => tail.kill());
    return;
  }
```

- [ ] **Step 2: Verify SSE stream**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
# Should stream last 50 lines then wait
curl -s --max-time 3 http://localhost:4242/logs/pm | head -5
kill %1
```

Expected: Lines starting with `data: [2026-` from the PM log.

- [ ] **Step 3: Commit**

```bash
git add dashboard/server.js
git commit -m "feat: add SSE log streaming endpoint"
```

---

## Task 5: Trigger endpoint (`POST /trigger/:agent`)

**Files:**
- Modify: `dashboard/server.js`

- [ ] **Step 1: Add the `POST /trigger/:agent` route**

Add inside `http.createServer`, before the final 404:

```js
  const triggerMatch = url.match(/^\/trigger\/([a-z]+)$/);
  if (method === 'POST' && triggerMatch) {
    const agent = triggerMatch[1];
    const { AGENTS } = require('./status.js');
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }

    const script = `/Volumes/ex-ssd/workspace/mtbox/scripts/run-${agent}.sh`;
    const child = spawn('bash', [script], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: '/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
        HOME: '/Users/lelinh',
      },
    });
    child.unref();

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ ok: true, agent }));
  }
```

- [ ] **Step 2: Verify trigger fires the agent**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
curl -s -X POST http://localhost:4242/trigger/pm
# Wait 2 seconds, check lock file appeared then cleared
sleep 1 && ls status/pm.lock 2>/dev/null && echo "lock exists (agent running)" || echo "no lock (may have finished)"
kill %1
```

Expected: `{"ok":true,"agent":"pm"}` from curl.

- [ ] **Step 3: Commit**

```bash
git add dashboard/server.js
git commit -m "feat: add POST /trigger/:agent endpoint"
```

---

## Task 6: `index.html` — structure, CSS, and light brutalism styling

**Files:**
- Modify: `dashboard/index.html`

- [ ] **Step 1: Write the full HTML skeleton with CSS**

```html
<!-- dashboard/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MTBox Agents</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f5f0e8;
      --border: 2px solid #111;
      --shadow: 3px 3px 0 #111;
      --shadow-lg: 6px 6px 0 #111;
      --font: 'Courier New', 'JetBrains Mono', monospace;
    }

    body { background: var(--bg); font-family: var(--font); min-height: 100vh; }

    /* ── Header ── */
    #header {
      background: #111; color: var(--bg);
      padding: 12px 18px;
      display: flex; justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 10;
    }
    #header h1 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
    #header-meta { font-size: 10px; opacity: 0.55; }

    /* ── Section bar ── */
    .section-bar {
      padding: 6px 18px; font-size: 9px; text-transform: uppercase;
      letter-spacing: 1.5px; color: #888; border-bottom: 1px solid #ddd;
      background: var(--bg);
    }

    /* ── Agent row ── */
    .agent-row {
      border-bottom: var(--border); background: white;
      cursor: pointer; user-select: none;
      border-left: 4px solid transparent;
      transition: border-left-color 0.1s;
    }
    .agent-row.is-busy  { border-left-color: #c8860a; background: #fffdf5; }
    .agent-row.is-error { border-left-color: #c0392b; background: #fffafa; }

    .row-main {
      display: flex; align-items: center;
      padding: 10px 16px; gap: 10px;
    }
    .agent-name {
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; min-width: 92px;
    }

    .badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; padding: 2px 6px; border: 1.5px solid; white-space: nowrap;
    }
    .badge-idle  { background: #d4f5d4; color: #1a5c1a; border-color: #1a5c1a; }
    .badge-busy  { background: #fff3cd; color: #7a5800; border-color: #c8860a; }
    .badge-error { background: #fde8e8; color: #8b1a1a; border-color: #c0392b; }
    .badge-never { background: #e8e8e8; color: #555;    border-color: #aaa; }

    .row-spacer { flex: 1; }
    .row-right  { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }

    .timer { font-size: 10px; color: #666; white-space: nowrap; }
    .timer.running { color: #c8860a; font-weight: 700; }

    .btn {
      background: #111; color: var(--bg);
      border: var(--border); padding: 4px 10px;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; cursor: pointer;
      font-family: var(--font); box-shadow: 2px 2px 0 #555;
      white-space: nowrap;
    }
    .btn:disabled { background: #ccc; color: #888; border-color: #bbb; box-shadow: none; cursor: not-allowed; }
    .btn:not(:disabled):active { box-shadow: none; transform: translate(2px, 2px); }

    .task-preview {
      padding: 3px 16px 8px; font-size: 10px; color: #666;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-top: 1px solid #eee;
    }

    /* ── Log panel ── */
    .log-panel {
      display: none;
      background: #141414; color: #d0d0d0;
      padding: 8px 12px; max-height: 180px; overflow-y: auto;
      font-size: 10px; line-height: 1.6;
      border-top: 1.5px dashed #444;
    }
    .log-panel.open { display: block; }
    .log-ts   { color: #555; }
    .log-hi   { color: #7ec8e3; }
    .log-ok   { color: #6fcf97; }
    .log-warn { color: #f2c94c; }
    .log-err  { color: #e07070; }

    /* ── Footer ── */
    #footer {
      background: var(--bg); border-top: var(--border);
      padding: 7px 16px; display: flex; justify-content: space-between; align-items: center;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #2a9d2a; display: inline-block; margin-right: 5px; border: 1.5px solid #1a5c1a; }
    .foot-txt { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; }

    /* ── Desktop layout ── */
    @media (min-width: 768px) {
      body { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

      #main { display: flex; flex: 1; overflow: hidden; }

      #agent-list {
        width: 280px; flex-shrink: 0;
        border-right: var(--border);
        overflow-y: auto;
      }

      /* On desktop, rows don't expand — clicking selects */
      #agent-list .log-panel { display: none !important; }
      #agent-list .task-preview { display: block; }
      #agent-list .agent-row.selected { background: #ede8df; }
      #agent-list .agent-row.is-busy.selected  { background: #fff5d6; }
      #agent-list .agent-row.is-error.selected { background: #fde8e8; }

      #detail-panel {
        flex: 1; display: flex; flex-direction: column;
        background: white; overflow: hidden;
      }
      #detail-panel.hidden { display: none; }

      #detail-header {
        padding: 12px 18px; border-bottom: var(--border);
        display: flex; align-items: flex-start; gap: 12px;
      }
      #detail-agent-name { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
      #detail-task       { font-size: 10px; color: #666; margin-top: 3px; }
      #detail-spacer     { flex: 1; }
      #detail-trigger-btn { padding: 6px 14px; font-size: 10px; }

      #detail-log {
        flex: 1; background: #141414; color: #d0d0d0;
        padding: 12px 16px; font-size: 11px; line-height: 1.7;
        overflow-y: auto;
      }
      #detail-log .log-ts   { color: #555; }
      #detail-log .log-hi   { color: #7ec8e3; }
      #detail-log .log-ok   { color: #6fcf97; }
      #detail-log .log-warn { color: #f2c94c; }
      #detail-log .log-err  { color: #e07070; }
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>MTBox Agents</h1>
    <span id="header-meta">loading...</span>
  </div>

  <!-- Mobile: flat list -->
  <div id="mobile-list">
    <!-- rendered by JS -->
  </div>

  <!-- Desktop: split layout -->
  <div id="main" style="display:none">
    <div id="agent-list">
      <!-- rendered by JS -->
    </div>
    <div id="detail-panel" class="hidden">
      <div id="detail-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="detail-agent-name"></span>
            <span id="detail-badge" class="badge"></span>
          </div>
          <div id="detail-task"></div>
        </div>
        <span id="detail-spacer"></span>
        <button id="detail-trigger-btn" class="btn">▶ Run Now</button>
      </div>
      <div id="detail-log"></div>
    </div>
  </div>

  <div id="footer">
    <span class="foot-txt"><span class="dot"></span>Live</span>
    <span class="foot-txt" id="footer-port">port 4242</span>
  </div>

  <script>
    // JS added in Task 7
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML loads cleanly**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
curl -s http://localhost:4242/ | grep "<title>"
kill %1
```

Expected: `  <title>MTBox Agents</title>`

- [ ] **Step 3: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: add dashboard HTML structure and brutalism CSS"
```

---

## Task 7: Status polling and agent row rendering

**Files:**
- Modify: `dashboard/index.html` — replace `// JS added in Task 7` comment with the script below

- [ ] **Step 1: Add the status polling and render logic inside the `<script>` tag**

```js
    const IS_DESKTOP = () => window.innerWidth >= 768;

    let state = { agents: [], serverTime: 0 };
    let selectedAgent = null;
    let sseSource = null;
    let timers = {};         // name -> { remaining } or { elapsed, start }
    let expandedMobile = {}; // name -> bool (mobile expand state)

    // ── Helpers ──────────────────────────────────────────────────

    function badgeClass(status) {
      return { idle: 'badge-idle', busy: 'badge-busy', error: 'badge-error', never: 'badge-never' }[status] || 'badge-never';
    }

    function formatCountdown(seconds) {
      if (seconds === null || seconds === undefined) return '—';
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    function timerText(agent) {
      if (agent.status === 'busy') {
        const elapsed = timers[agent.name]?.elapsed ?? 0;
        return `⏱ running ${formatCountdown(elapsed)}`;
      }
      const remaining = timers[agent.name]?.remaining ?? agent.nextRunIn;
      if (remaining === null) return '⏱ —';
      return `⏱ next in ${formatCountdown(remaining)}`;
    }

    function summaryPrefix(status) {
      return status === 'error' ? '✗ ' : status === 'idle' ? '✓ ' : '';
    }

    function colorLogLine(raw) {
      const escaped = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return escaped
        .replace(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/, '<span class="log-ts">$1</span>')
        .replace(/(error|failed|✗)/gi, '<span class="log-err">$1</span>')
        .replace(/(done\.|complete|✓|moved|pushed)/gi, '<span class="log-ok">$1</span>')
        .replace(/(fetching|reading|generating|creating|starting)/gi, '<span class="log-hi">$1</span>');
    }

    // ── Row HTML ─────────────────────────────────────────────────

    function rowHTML(agent, forDesktop) {
      const cls = agent.status === 'busy' ? 'is-busy' : agent.status === 'error' ? 'is-error' : '';
      const selectedCls = (forDesktop && selectedAgent === agent.name) ? 'selected' : '';
      const timerCls = agent.status === 'busy' ? 'running' : '';
      const preview = agent.lastSummary
        ? summaryPrefix(agent.status) + agent.lastSummary
        : (agent.status === 'never' ? 'Never run' : '—');

      return `
        <div class="agent-row ${cls} ${selectedCls}" data-agent="${agent.name}" onclick="handleRowClick('${agent.name}')">
          <div class="row-main">
            <span class="agent-name">${agent.name.toUpperCase()}</span>
            <span class="badge ${badgeClass(agent.status)}">${agent.status.toUpperCase()}</span>
            <span class="row-spacer"></span>
            <div class="row-right">
              <span class="timer ${timerCls}" id="timer-${forDesktop?'d':'m'}-${agent.name}">${timerText(agent)}</span>
              <button class="btn" onclick="event.stopPropagation(); triggerAgent('${agent.name}')"
                ${agent.status === 'busy' ? 'disabled' : ''}>▶ Run</button>
            </div>
          </div>
          <div class="task-preview">${preview}</div>
          ${forDesktop ? '' : `<div class="log-panel" id="log-m-${agent.name}"></div>`}
        </div>`;
    }

    // ── Render ───────────────────────────────────────────────────

    function render(agents) {
      if (IS_DESKTOP()) {
        document.getElementById('mobile-list').style.display = 'none';
        document.getElementById('main').style.display = 'flex';

        const list = document.getElementById('agent-list');
        list.innerHTML = agents.map(a => rowHTML(a, true)).join('');

        if (!selectedAgent) {
          const busy = agents.find(a => a.status === 'busy');
          selectedAgent = busy ? busy.name : agents[0]?.name;
        }
        if (typeof updateDetailPanel === 'function') updateDetailPanel();
      } else {
        document.getElementById('mobile-list').style.display = 'block';
        document.getElementById('main').style.display = 'none';
        document.getElementById('mobile-list').innerHTML = agents.map(a => rowHTML(a, false)).join('');

        // Re-open any expanded log panels
        for (const [name, open] of Object.entries(expandedMobile)) {
          if (open) {
            const panel = document.getElementById(`log-m-${name}`);
            if (panel) panel.classList.add('open');
          }
        }
      }
    }

    // ── Polling ──────────────────────────────────────────────────

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        state = data;
        // Resync timers
        for (const agent of data.agents) {
          if (agent.status === 'busy') {
            timers[agent.name] = { elapsed: 0, start: Date.now() };
          } else {
            timers[agent.name] = { remaining: agent.nextRunIn };
          }
        }
        render(data.agents);
        updateHeaderMeta(data.agents);
      } catch (e) {
        console.error('Status fetch failed', e);
      }
    }

    function updateHeaderMeta(agents) {
      const running = agents.filter(a => a.status === 'busy').length;
      const errors  = agents.filter(a => a.status === 'error').length;
      let meta = `${agents.length} agents`;
      if (running) meta += ` · ${running} running`;
      if (errors)  meta += ` · ${errors} error`;
      document.getElementById('header-meta').textContent = meta;
    }

    fetchStatus();
    setInterval(fetchStatus, 5000);
```

- [ ] **Step 2: Verify the page renders agent rows**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
# Open http://localhost:4242 in browser — should show 4 agent rows
# Or check the JS doesn't syntax error:
node -e "const fs=require('fs'); const html=fs.readFileSync('dashboard/index.html','utf8'); console.log('OK')"
kill %1
```

Expected: `OK` (no syntax errors in file read). Visually verify in browser that 4 rows render.

- [ ] **Step 3: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: add status polling and agent row rendering"
```

---

## Task 8: Countdown timers and log panel

**Files:**
- Modify: `dashboard/index.html` — append to the `<script>` block

- [ ] **Step 1: Add timer tick, mobile expand/collapse, desktop detail panel, and SSE log streaming**

Append inside `<script>`, after the polling code:

```js
    // ── Timer tick ───────────────────────────────────────────────

    let expandedMobile = {};  // name -> bool

    setInterval(() => {
      for (const agent of state.agents) {
        const t = timers[agent.name];
        if (!t) continue;
        if (agent.status === 'busy') {
          t.elapsed = Math.floor((Date.now() - t.start) / 1000);
        } else if (t.remaining > 0) {
          t.remaining = Math.max(0, t.remaining - 1);
        }
        // Update both mobile and desktop timer elements
        for (const prefix of ['m', 'd']) {
          const el = document.getElementById(`timer-${prefix}-${agent.name}`);
          if (el) {
            el.textContent = timerText(agent);
            el.className = 'timer' + (agent.status === 'busy' ? ' running' : '');
          }
        }
      }
    }, 1000);

    // ── Mobile: tap row to expand/collapse log ───────────────────

    function handleRowClick(name) {
      if (IS_DESKTOP()) {
        selectedAgent = name;
        // Re-render list to update selected highlight
        render(state.agents);
        updateDetailPanel();
        return;
      }
      // Mobile: toggle log panel
      expandedMobile[name] = !expandedMobile[name];
      const panel = document.getElementById(`log-m-${name}`);
      if (!panel) return;
      if (expandedMobile[name]) {
        panel.classList.add('open');
        streamLog(name, panel);
      } else {
        panel.classList.remove('open');
        if (sseSource && sseSource._agent === name) {
          sseSource.close();
          sseSource = null;
        }
      }
    }

    // ── SSE log streaming ────────────────────────────────────────

    function streamLog(name, container) {
      if (sseSource) { sseSource.close(); sseSource = null; }
      container.innerHTML = '';

      const es = new EventSource(`/logs/${name}`);
      es._agent = name;
      sseSource = es;

      es.onmessage = (e) => {
        const line = document.createElement('div');
        line.innerHTML = colorLogLine(e.data);
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
      };
      es.onerror = () => {
        const line = document.createElement('div');
        line.style.color = '#e07070';
        line.textContent = '[connection lost — retrying...]';
        container.appendChild(line);
      };
    }

    // ── Desktop: detail panel ────────────────────────────────────

    function updateDetailPanel() {
      if (!IS_DESKTOP()) return;
      const agent = state.agents.find(a => a.name === selectedAgent);
      if (!agent) return;

      const panel = document.getElementById('detail-panel');
      panel.classList.remove('hidden');

      document.getElementById('detail-agent-name').textContent = agent.name.toUpperCase();

      const badge = document.getElementById('detail-badge');
      badge.textContent = agent.status.toUpperCase();
      badge.className = `badge ${badgeClass(agent.status)}`;

      const preview = agent.lastSummary
        ? summaryPrefix(agent.status) + agent.lastSummary
        : (agent.status === 'never' ? 'Never run' : '—');
      document.getElementById('detail-task').textContent = preview;

      const trigBtn = document.getElementById('detail-trigger-btn');
      trigBtn.disabled = agent.status === 'busy';
      trigBtn.onclick = () => triggerAgent(agent.name);

      // Only re-stream if agent changed
      const logEl = document.getElementById('detail-log');
      if (logEl.dataset.agent !== agent.name) {
        logEl.dataset.agent = agent.name;
        streamLog(agent.name, logEl);
      }
    }

    // ── Trigger ──────────────────────────────────────────────────

    async function triggerAgent(name) {
      try {
        await fetch(`/trigger/${name}`, { method: 'POST' });
        // Refresh status immediately
        setTimeout(fetchStatus, 500);
      } catch (e) {
        console.error('Trigger failed', e);
      }
    }

    // ── Responsive: re-render on resize ─────────────────────────

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(state.agents), 150);
    });

    // ── Auto-expand busy agent on mobile load ────────────────────

    window.addEventListener('DOMContentLoaded', () => {
      document.getElementById('footer-port').textContent = `port ${location.port || 4242}`;
    });
```

- [ ] **Step 2: Verify in browser**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
node dashboard/server.js &
```

Open `http://localhost:4242` in browser. Verify:
- Countdown timers tick every second
- Tapping a row on mobile shows the dark log panel with live lines
- On desktop (≥768px), clicking a row updates the right panel with the log stream

```bash
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: add countdown timers, SSE log panel, and trigger button"
```

---

## Task 9: launchd plist and final smoke test

**Files:**
- Create: `~/Library/LaunchAgents/com.mtbox.dashboard.plist`

- [ ] **Step 1: Write the plist**

```bash
cat > ~/Library/LaunchAgents/com.mtbox.dashboard.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mtbox.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Volumes/ex-ssd/workspace/mtbox/dashboard/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/dashboard-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/lelinh</string>
    </dict>
</dict>
</plist>
EOF
```

- [ ] **Step 2: Load the service**

```bash
launchctl load ~/Library/LaunchAgents/com.mtbox.dashboard.plist
sleep 2
launchctl list | grep com.mtbox.dashboard
```

Expected: a line like `12345  0  com.mtbox.dashboard` (non-zero PID means it's running).

- [ ] **Step 3: Verify it's reachable**

```bash
curl -s http://localhost:4242/api/status | node -e \
  "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).agents.map(a=>a.name).join(', '))"
```

Expected: `pm, designer, programmer, qa`

- [ ] **Step 4: Find your machine's LAN IP and test from phone**

```bash
ipconfig getifaddr en0
```

Open `http://<that-ip>:4242` on your phone. Verify the dashboard loads and shows agent rows.

- [ ] **Step 5: Commit and add plist to repo**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
cp ~/Library/LaunchAgents/com.mtbox.dashboard.plist scripts/com.mtbox.dashboard.plist
git add scripts/com.mtbox.dashboard.plist
git commit -m "feat: add dashboard launchd plist and complete agent dashboard"
```

---

## Checklist: Spec Coverage

| Spec requirement | Task |
|---|---|
| Responsive — phone + desktop | Task 6, 7, 8 |
| Agent status (idle/busy/error) | Task 2, 7 |
| Countdown timer to next wake | Task 2, 8 |
| Task preview from log | Task 2, 7 |
| Live log streaming | Task 4, 8 |
| Trigger agent immediately | Task 5, 8 |
| No auth, LAN accessible | Task 9 |
| Runs as launchd service | Task 9 |
| Light brutalism design | Task 6 |
| Pure Node.js, no npm | All tasks |
