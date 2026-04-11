# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat-row dashboard with a card grid that visually distinguishes each agent by color/emoji/role, and scope the log panel to one run at a time with a history browser.

**Architecture:** Three-file change — `status.js` exports two existing regex constants, `server.js` gains two new endpoints and a modified SSE tail, `index.html` is fully rewritten with a CSS grid card layout and run-picker log panel. No new files; no changes to agent scripts or status files.

**Tech Stack:** Node.js (http, fs, child_process/spawn), vanilla JS (EventSource, fetch), CSS Grid.

---

### Task 1: Export STARTING_RE and DONE_RE from status.js

**Files:**
- Modify: `dashboard/status.js:82`

`STARTING_RE` and `DONE_RE` are already defined in `status.js` but not exported. `server.js` will need them in Task 2 to implement `parseRuns()`.

- [ ] **Step 1: Read the current module.exports line**

Current line 82 of `dashboard/status.js`:
```js
module.exports = { parseLastRunAt, parseLastSummary, readAgentStatus, getAllAgentStatuses, AGENTS };
```

- [ ] **Step 2: Add STARTING_RE and DONE_RE to the exports**

Replace line 82 with:
```js
module.exports = { parseLastRunAt, parseLastSummary, readAgentStatus, getAllAgentStatuses, AGENTS, STARTING_RE, DONE_RE };
```

- [ ] **Step 3: Verify the server still starts**

```bash
node -e "const s = require('./dashboard/status.js'); console.log(typeof s.STARTING_RE, typeof s.DONE_RE);"
```

Expected output: `object object`

- [ ] **Step 4: Commit**

```bash
git add dashboard/status.js
git commit -m "feat: export STARTING_RE and DONE_RE from status.js"
```

---

### Task 2: Add run history endpoints and update SSE tail in server.js

**Files:**
- Modify: `dashboard/server.js`

Three changes to `server.js`:
1. Import `STARTING_RE`, `DONE_RE`, `parseLastSummary` from `status.js`
2. Add `parseRuns(logContent)` helper
3. Add `GET /logs/{agent}/runs` → JSON list of runs (latest first)
4. Add `GET /logs/{agent}/runs/{index}` → plain text of one run
5. Change SSE tail from `tail -n 50 -f` to `tail -n +{lastRunLine+1} -f`

- [ ] **Step 1: Update the import line at the top of server.js**

Current line 6:
```js
const { getAllAgentStatuses, AGENTS } = require('./status.js');
```

Replace with:
```js
const { getAllAgentStatuses, AGENTS, STARTING_RE, DONE_RE, parseLastSummary } = require('./status.js');
```

- [ ] **Step 2: Add the parseRuns helper function**

Add this function after the `serveFile` function (after line 24, before the `http.createServer` call):

```js
function parseRuns(logContent) {
  if (!logContent) return [];
  const lines = logContent.split('\n');
  const runs = [];
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STARTING_RE);
    if (m) {
      if (startLine === -1 && i > 0) {
        // Everything before the first === starting === is "Legacy" run (index 0)
        runs.push({ index: 0, startedAt: null, summary: 'Legacy', startLine: 0, endLine: i - 1 });
      } else if (startLine !== -1) {
        // Close the previous run
        const prevRun = runs[runs.length - 1];
        prevRun.endLine = i - 1;
      }
      const startedAt = new Date(m[1].replace(' ', 'T')).toISOString();
      runs.push({ index: runs.length, startedAt, summary: null, startLine: i, endLine: lines.length - 1 });
      startLine = i;
    }
  }

  if (runs.length === 0) {
    // No runs found at all — return a single legacy block covering everything
    return [{ index: 0, startedAt: null, summary: 'Legacy', startLine: 0, endLine: lines.length - 1 }];
  }

  // Fill summaries for each run using the same logic as parseLastSummary
  for (const run of runs) {
    if (run.startedAt === null) continue; // Legacy run — no summary parsing
    const runLines = lines.slice(run.startLine, run.endLine + 1);
    const doneIdx = runLines.findIndex(l => DONE_RE.test(l));
    if (doneIdx !== -1) {
      for (let i = 1; i < doneIdx; i++) {
        const trimmed = runLines[i].trim();
        if (trimmed && !/^\[\d{4}-\d{2}-\d{2}/.test(trimmed)) {
          run.summary = trimmed;
          break;
        }
      }
    }
  }

  // Return latest first (reverse index order), strip internal line tracking
  return runs
    .slice()
    .reverse()
    .map(({ index, startedAt, summary }) => ({ index, startedAt, summary }));
}
```

- [ ] **Step 3: Add GET /logs/{agent}/runs endpoint**

Add this route inside the `http.createServer` callback, before the `logMatch` route (insert after the `/api/status` block, around line 40):

```js
  const runsListMatch = url.match(/^\/logs\/([a-z]+)\/runs$/);
  if (method === 'GET' && runsListMatch) {
    const agent = runsListMatch[1];
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }
    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;
    let logContent = '';
    try { logContent = fs.readFileSync(logFile, 'utf8'); } catch {}
    const runs = parseRuns(logContent);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify(runs));
  }
```

- [ ] **Step 4: Add GET /logs/{agent}/runs/{index} endpoint**

Add this route immediately after the runs list route:

```js
  const runItemMatch = url.match(/^\/logs\/([a-z]+)\/runs\/(\d+)$/);
  if (method === 'GET' && runItemMatch) {
    const agent = runItemMatch[1];
    const idx   = parseInt(runItemMatch[2], 10);
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }
    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;
    let logContent = '';
    try { logContent = fs.readFileSync(logFile, 'utf8'); } catch {}
    const lines = logContent.split('\n');

    // Rebuild run boundaries (same logic as parseRuns but we need startLine/endLine)
    const boundaries = [];
    let firstStartLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (STARTING_RE.test(lines[i])) {
        if (firstStartLine === -1 && i > 0) {
          boundaries.push({ index: 0, startLine: 0, endLine: i - 1 });
        } else if (boundaries.length > 0) {
          boundaries[boundaries.length - 1].endLine = i - 1;
        }
        boundaries.push({ index: boundaries.length, startLine: i, endLine: lines.length - 1 });
        firstStartLine = i;
      }
    }
    if (boundaries.length === 0) {
      boundaries.push({ index: 0, startLine: 0, endLine: lines.length - 1 });
    }

    const run = boundaries.find(r => r.index === idx);
    if (!run) { res.writeHead(404); return res.end('Run not found'); }

    const text = lines.slice(run.startLine, run.endLine + 1).join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(text);
  }
```

- [ ] **Step 5: Update the SSE tail to start from the last run**

Find the `logMatch` SSE handler. Current tail line (around line 60):
```js
    const tail = spawn('tail', ['-n', '50', '-f', logFile]);
```

Replace the block from `// Create file if it doesn't exist...` through `const tail = spawn(...)` with:

```js
    // Create file if it doesn't exist so tail -f doesn't error
    if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

    // Find the line number of the last run start; tail from there
    let tailArgs;
    try {
      const logContent = fs.readFileSync(logFile, 'utf8');
      const lines = logContent.split('\n');
      let lastRunLine = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (STARTING_RE.test(lines[i])) { lastRunLine = i; break; }
      }
      if (lastRunLine >= 0) {
        tailArgs = ['-n', `+${lastRunLine + 1}`, '-f', logFile];
      } else {
        tailArgs = ['-n', '50', '-f', logFile];
      }
    } catch {
      tailArgs = ['-n', '50', '-f', logFile];
    }

    const tail = spawn('tail', tailArgs);
```

- [ ] **Step 6: Verify the server starts and the new routes respond**

```bash
# Start the server in one terminal
node dashboard/server.js &
SERVER_PID=$!
sleep 1

# Test the new runs endpoint (pm agent)
curl -s http://localhost:4242/logs/pm/runs | head -c 200

# Test run item endpoint (should return 404 or text)
curl -s -o /dev/null -w "%{http_code}" http://localhost:4242/logs/pm/runs/0

# Stop server
kill $SERVER_PID
```

Expected: First curl returns a JSON array (possibly `[]` or `[{"index":0,...}]`). Second curl returns `200` or `404`.

- [ ] **Step 7: Commit**

```bash
git add dashboard/server.js
git commit -m "feat: add run history endpoints and scoped SSE tail to dashboard server"
```

---

### Task 3: Rewrite index.html with card grid and run-picker log panel

**Files:**
- Modify: `dashboard/index.html` (full rewrite)

Replace the entire contents of `dashboard/index.html` with the new design. Key structural changes:
- `#agent-grid`: CSS Grid, 3 columns on desktop, 2 on tablet (≥480px), 1 on mobile
- Each `.agent-card` has a 5px left border in agent color, selected state adds full border + tinted background
- Log panel `#log-panel` is below the grid on desktop (full-width), inline on mobile (toggles under tapped card)
- Run picker: `← Prev | Run N — date | Latest →` buttons appear when 2+ runs exist

- [ ] **Step 1: Write the new index.html**

Replace the full contents of `dashboard/index.html` with:

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

    /* ── Card Grid ── */
    #agent-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      border-bottom: var(--border);
    }
    @media (min-width: 480px) {
      #agent-grid { grid-template-columns: repeat(2, 1fr); }
      #agent-grid .agent-card { border-right: var(--border); }
      #agent-grid .agent-card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 768px) {
      #agent-grid { grid-template-columns: repeat(3, 1fr); }
      #agent-grid .agent-card { border-right: var(--border); }
      #agent-grid .agent-card:nth-child(3n) { border-right: none; }
    }

    .agent-card {
      background: white;
      border-bottom: var(--border);
      border-left: 5px solid var(--agent-color, #aaa);
      cursor: pointer; user-select: none;
      transition: background 0.1s;
      padding: 12px 14px 10px;
      display: flex; flex-direction: column; gap: 6px;
      position: relative;
    }
    .agent-card.selected {
      border-color: var(--agent-color, #aaa);
      background: color-mix(in srgb, var(--agent-color, #aaa) 8%, white);
      outline: 3px solid var(--agent-color, #aaa);
      outline-offset: -3px;
      z-index: 1;
    }
    .agent-card.is-busy  { background: #fffdf5; }
    .agent-card.is-error { background: #fffafa; }
    .agent-card.is-busy.selected  { background: color-mix(in srgb, var(--agent-color, #aaa) 8%, #fffdf5); }
    .agent-card.is-error.selected { background: color-mix(in srgb, var(--agent-color, #aaa) 8%, #fffafa); }

    /* Card top row: emoji+name on left, run button on right */
    .card-top {
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .card-identity { display: flex; align-items: baseline; gap: 6px; }
    .card-emoji { font-size: 18px; line-height: 1; }
    .card-name  { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .card-role  { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }

    /* Badge + timer row */
    .card-mid {
      display: flex; align-items: center; gap: 8px;
    }
    .badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; padding: 2px 6px; border: 1.5px solid; white-space: nowrap;
    }
    .badge-idle  { background: #d4f5d4; color: #1a5c1a; border-color: #1a5c1a; }
    .badge-busy  { background: #fff3cd; color: #7a5800; border-color: #c8860a; }
    .badge-error { background: #fde8e8; color: #8b1a1a; border-color: #c0392b; }
    .badge-never { background: #e8e8e8; color: #555;    border-color: #aaa; }
    .timer { font-size: 10px; color: #666; }
    .timer.running { color: #c8860a; font-weight: 700; }

    /* Last summary */
    .card-summary {
      font-size: 10px; color: #777;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-top: 1px solid #eee; padding-top: 6px; margin-top: 2px;
    }

    /* Run button */
    .btn {
      background: #111; color: var(--bg);
      border: var(--border); padding: 4px 10px;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; cursor: pointer;
      font-family: var(--font);
      white-space: nowrap;
    }
    .btn:disabled { background: #ccc; color: #888; border-color: #bbb; cursor: not-allowed; }
    .btn:not(:disabled):active { opacity: 0.7; }
    .btn-sm { padding: 3px 8px; font-size: 9px; }

    /* ── Log Panel (desktop: below grid; mobile: inline per card) ── */
    #log-panel {
      display: none;
      flex-direction: column;
      border-top: var(--border);
    }
    #log-panel.open { display: flex; }

    .log-panel-header {
      background: #1e1e1e; color: #ccc;
      padding: 6px 14px;
      display: flex; align-items: center; gap: 10px;
      font-size: 10px; border-bottom: 1px solid #333;
      flex-shrink: 0;
    }
    .log-panel-title {
      font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
      color: white; display: flex; align-items: center; gap: 6px;
    }
    .live-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #2a9d2a; display: inline-block;
      border: 1.5px solid #1a5c1a;
    }
    .live-dot.busy { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .log-panel-spacer { flex: 1; }

    /* Run picker */
    #run-picker {
      display: none; align-items: center; gap: 6px;
    }
    #run-picker.visible { display: flex; }
    #run-label { font-size: 10px; white-space: nowrap; }
    .btn-nav { padding: 2px 7px; font-size: 9px; }
    .btn-nav:disabled { background: transparent; color: #555; border-color: #444; cursor: default; }

    #log-output {
      background: #141414; color: #d0d0d0;
      padding: 10px 14px;
      font-size: 11px; line-height: 1.7;
      overflow-y: auto;
      height: 240px;
      flex-shrink: 0;
    }
    .log-ts   { color: #555; }
    .log-hi   { color: #7ec8e3; }
    .log-ok   { color: #6fcf97; }
    .log-warn { color: #f2c94c; }
    .log-err  { color: #e07070; }

    /* Mobile inline log (toggled under card) */
    .card-log-inline {
      display: none;
      background: #141414; color: #d0d0d0;
      padding: 8px 12px; max-height: 200px; overflow-y: auto;
      font-size: 10px; line-height: 1.6;
      border-top: 1px dashed #333;
    }
    .card-log-inline.open { display: block; }

    /* ── Footer ── */
    #footer {
      background: var(--bg); border-top: var(--border);
      padding: 7px 16px; display: flex; justify-content: space-between; align-items: center;
    }
    .foot-txt { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; }

    /* Hide log panel on mobile (cards use inline) */
    @media (max-width: 767px) {
      #log-panel { display: none !important; }
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>MTBox Agents</h1>
    <span id="header-meta">loading...</span>
  </div>

  <div id="agent-grid"></div>

  <div id="log-panel">
    <div class="log-panel-header">
      <span class="log-panel-title">
        <span class="live-dot" id="live-dot"></span>
        <span id="log-panel-agent-name">—</span>
      </span>
      <span id="log-live-label" style="color:#2a9d2a;font-size:9px;">● Live</span>
      <span class="log-panel-spacer"></span>
      <div id="run-picker">
        <button class="btn btn-nav" id="btn-prev" onclick="navigateRun(-1)">← Prev</button>
        <span id="run-label">—</span>
        <button class="btn btn-nav" id="btn-next" onclick="navigateRun(+1)">Latest →</button>
      </div>
    </div>
    <div id="log-output"></div>
  </div>

  <div id="footer">
    <span class="foot-txt"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2a9d2a;border:1.5px solid #1a5c1a;margin-right:5px;vertical-align:middle;"></span>Live</span>
    <span class="foot-txt" id="footer-port">port 4242</span>
  </div>

  <script>
    const AGENT_CONFIG = {
      pm:         { color: '#3b82f6', emoji: '📋', role: 'Workflow orchestration' },
      cto:        { color: '#06b6d4', emoji: '🏗️',  role: 'Strategic planning' },
      designer:   { color: '#a855f7', emoji: '🎨', role: 'UI mockups' },
      programmer: { color: '#22c55e', emoji: '💻', role: 'Implementation' },
      qa:         { color: '#eab308', emoji: '🧪', role: 'Testing' },
    };

    const IS_MOBILE = () => window.innerWidth < 768;

    let state = { agents: [], serverTime: 0 };
    let selectedAgent = null;
    let sseSource = null;        // live SSE for the selected agent
    let mobileSseMap = {};       // name -> EventSource (mobile)
    let timers = {};
    let mobileExpanded = {};     // name -> bool

    // Run picker state (desktop)
    let allRuns = [];            // latest-first array from /logs/{agent}/runs
    let viewingIdx = null;       // null = live mode, otherwise run.index

    // ── Utilities ────────────────────────────────────────────────

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function badgeClass(status) {
      return { idle: 'badge-idle', busy: 'badge-busy', error: 'badge-error', never: 'badge-never' }[status] || 'badge-never';
    }

    function formatCountdown(sec) {
      if (sec === null || sec === undefined) return '—';
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    }

    function timerText(agent) {
      if (agent.status === 'busy') {
        return `⏱ running ${formatCountdown(timers[agent.name]?.elapsed ?? 0)}`;
      }
      const rem = timers[agent.name]?.remaining ?? agent.nextRunIn;
      return rem === null ? '⏱ —' : `⏱ next in ${formatCountdown(rem)}`;
    }

    function colorLogLine(raw) {
      const e = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return e
        .replace(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/, '<span class="log-ts">$1</span>')
        .replace(/(error|failed|✗)/gi, '<span class="log-err">$1</span>')
        .replace(/(done\.|complete|✓|moved|pushed)/gi, '<span class="log-ok">$1</span>')
        .replace(/(fetching|reading|generating|creating|starting)/gi, '<span class="log-hi">$1</span>');
    }

    function formatRunDate(isoStr) {
      if (!isoStr) return 'Legacy';
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // ── Card rendering ───────────────────────────────────────────

    function cardHTML(agent) {
      const cfg = AGENT_CONFIG[agent.name] || { color: '#aaa', emoji: '?', role: '' };
      const statusCls = agent.status === 'busy' ? 'is-busy' : agent.status === 'error' ? 'is-error' : '';
      const selectedCls = selectedAgent === agent.name ? 'selected' : '';
      const summary = agent.lastSummary
        ? (agent.status === 'error' ? '✗ ' : agent.status === 'idle' ? '✓ ' : '') + esc(agent.lastSummary)
        : (agent.status === 'never' ? 'Never run' : '—');
      const timerCls = agent.status === 'busy' ? 'running' : '';

      return `
        <div class="agent-card ${statusCls} ${selectedCls}"
             style="--agent-color: ${cfg.color}"
             data-agent="${agent.name}"
             onclick="handleCardClick('${agent.name}')">
          <div class="card-top">
            <div>
              <div class="card-identity">
                <span class="card-emoji">${cfg.emoji}</span>
                <span class="card-name">${agent.name.toUpperCase()}</span>
              </div>
              <div class="card-role">${esc(cfg.role)}</div>
            </div>
            <button class="btn btn-sm" onclick="event.stopPropagation(); triggerAgent('${agent.name}')"
              ${agent.status === 'busy' ? 'disabled' : ''}>&#9654; Run</button>
          </div>
          <div class="card-mid">
            <span class="badge ${badgeClass(agent.status)}">${agent.status.toUpperCase()}</span>
            <span class="timer ${timerCls}" id="timer-${agent.name}">${timerText(agent)}</span>
          </div>
          <div class="card-summary">${summary}</div>
          ${IS_MOBILE() ? `<div class="card-log-inline" id="log-inline-${agent.name}"></div>` : ''}
        </div>`;
    }

    function render(agents) {
      const grid = document.getElementById('agent-grid');
      grid.innerHTML = agents.map(a => cardHTML(a)).join('');
      // Re-open mobile inline logs that were expanded
      if (IS_MOBILE()) {
        for (const [name, open] of Object.entries(mobileExpanded)) {
          if (open) {
            const el = document.getElementById(`log-inline-${name}`);
            if (el) {
              el.classList.add('open');
              streamLive(name, el, true);
            }
          }
        }
      }
    }

    // ── Status polling ───────────────────────────────────────────

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        state = data;
        for (const agent of data.agents) {
          if (agent.status === 'busy') {
            if (!timers[agent.name] || timers[agent.name].remaining !== undefined) {
              timers[agent.name] = { elapsed: 0, start: Date.now() };
            }
          } else {
            timers[agent.name] = { remaining: agent.nextRunIn };
          }
        }
        render(data.agents);
        updateHeaderMeta(data.agents);
        if (selectedAgent && !IS_MOBILE()) updateLogPanelHeader();
      } catch (e) { console.error('Status fetch failed', e); }
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

    // ── Timer tick ───────────────────────────────────────────────

    setInterval(() => {
      for (const agent of state.agents) {
        const t = timers[agent.name];
        if (!t) continue;
        if (agent.status === 'busy') {
          t.elapsed = Math.floor((Date.now() - t.start) / 1000);
        } else if (t.remaining > 0) {
          t.remaining = Math.max(0, t.remaining - 1);
        }
        const el = document.getElementById(`timer-${agent.name}`);
        if (el) {
          el.textContent = timerText(agent);
          el.className = 'timer' + (agent.status === 'busy' ? ' running' : '');
        }
      }
    }, 1000);

    // ── Card click ───────────────────────────────────────────────

    function handleCardClick(name) {
      if (IS_MOBILE()) {
        mobileExpanded[name] = !mobileExpanded[name];
        const el = document.getElementById(`log-inline-${name}`);
        if (!el) return;
        if (mobileExpanded[name]) {
          el.classList.add('open');
          streamLive(name, el, true);
        } else {
          el.classList.remove('open');
          const src = mobileSseMap[name];
          if (src) { src.close(); delete mobileSseMap[name]; }
        }
        return;
      }
      // Desktop: select card, open log panel
      selectedAgent = name;
      // Re-render to show selected state
      render(state.agents);
      openLogPanel(name);
    }

    // ── Desktop log panel ────────────────────────────────────────

    async function openLogPanel(name) {
      const panel = document.getElementById('log-panel');
      panel.classList.add('open');

      document.getElementById('log-panel-agent-name').textContent = name.toUpperCase();
      const cfg = AGENT_CONFIG[name] || {};

      // Fetch runs
      allRuns = [];
      viewingIdx = null;
      try {
        const r = await fetch(`/logs/${name}/runs`);
        allRuns = await r.json();
      } catch {}

      updateRunPicker();
      // Start in live mode
      startLiveLog(name);
    }

    function updateLogPanelHeader() {
      if (!selectedAgent) return;
      document.getElementById('log-panel-agent-name').textContent = selectedAgent.toUpperCase();
    }

    function updateRunPicker() {
      const picker = document.getElementById('run-picker');
      if (allRuns.length < 2) {
        picker.classList.remove('visible');
        return;
      }
      picker.classList.add('visible');

      // allRuns is latest-first; viewingIdx==null means live
      const isLive = viewingIdx === null;
      const currentRunPos = isLive ? -1 : allRuns.findIndex(r => r.index === viewingIdx);
      const isOldest = !isLive && currentRunPos === allRuns.length - 1;
      const isLatest = isLive;

      document.getElementById('btn-prev').disabled = isOldest;
      document.getElementById('btn-next').disabled = isLatest;

      if (isLive) {
        document.getElementById('run-label').textContent = '● Live';
      } else {
        const run = allRuns[currentRunPos];
        const label = run.startedAt ? `Run ${run.index} — ${formatRunDate(run.startedAt)}` : 'Legacy';
        document.getElementById('run-label').textContent = label;
      }

      const liveLabel = document.getElementById('log-live-label');
      liveLabel.style.display = isLive ? '' : 'none';
      const dot = document.getElementById('live-dot');
      const agent = state.agents.find(a => a.name === selectedAgent);
      dot.className = 'live-dot' + (agent?.status === 'busy' ? ' busy' : '');
    }

    function navigateRun(direction) {
      // direction: -1 = older, +1 = newer/live
      // allRuns is latest-first, so index 0 = latest run, index last = oldest
      if (direction === +1) {
        // Move toward live
        if (viewingIdx === null) return; // already live
        const pos = allRuns.findIndex(r => r.index === viewingIdx);
        if (pos === 0) {
          // Was at latest run — go to live
          viewingIdx = null;
          startLiveLog(selectedAgent);
        } else {
          viewingIdx = allRuns[pos - 1].index;
          loadStaticRun(selectedAgent, viewingIdx);
        }
      } else {
        // Move toward older
        if (viewingIdx === null) {
          // From live, go to latest run
          if (allRuns.length === 0) return;
          viewingIdx = allRuns[0].index;
          loadStaticRun(selectedAgent, viewingIdx);
        } else {
          const pos = allRuns.findIndex(r => r.index === viewingIdx);
          if (pos >= allRuns.length - 1) return; // already oldest
          viewingIdx = allRuns[pos + 1].index;
          loadStaticRun(selectedAgent, viewingIdx);
        }
      }
      updateRunPicker();
    }

    function startLiveLog(name) {
      if (sseSource) { sseSource.close(); sseSource = null; }
      const output = document.getElementById('log-output');
      output.innerHTML = '';
      const es = new EventSource(`/logs/${name}`);
      sseSource = es;
      es.onmessage = (e) => {
        const line = document.createElement('div');
        line.innerHTML = colorLogLine(e.data);
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
      };
      es.onerror = () => {
        const line = document.createElement('div');
        line.style.color = '#e07070';
        line.textContent = '[connection lost — retrying...]';
        output.appendChild(line);
      };
    }

    async function loadStaticRun(name, idx) {
      if (sseSource) { sseSource.close(); sseSource = null; }
      const output = document.getElementById('log-output');
      output.innerHTML = '<div style="color:#555">Loading...</div>';
      try {
        const r = await fetch(`/logs/${name}/runs/${idx}`);
        const text = await r.text();
        output.innerHTML = '';
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          const el = document.createElement('div');
          el.innerHTML = colorLogLine(line);
          output.appendChild(el);
        }
        output.scrollTop = 0;
      } catch {
        output.innerHTML = '<div style="color:#e07070">[Failed to load run]</div>';
      }
    }

    // ── Mobile SSE ───────────────────────────────────────────────

    function streamLive(name, container, isMobile) {
      if (isMobile) {
        const existing = mobileSseMap[name];
        if (existing) { existing.close(); }
      }
      container.innerHTML = '';
      const es = new EventSource(`/logs/${name}`);
      if (isMobile) mobileSseMap[name] = es;
      es.onmessage = (e) => {
        const line = document.createElement('div');
        line.innerHTML = colorLogLine(e.data);
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
      };
      es.onerror = () => {
        const line = document.createElement('div');
        line.style.color = '#e07070';
        line.textContent = '[connection lost...]';
        container.appendChild(line);
      };
    }

    // ── Trigger ──────────────────────────────────────────────────

    async function triggerAgent(name) {
      try {
        await fetch(`/trigger/${name}`, { method: 'POST' });
        setTimeout(fetchStatus, 500);
      } catch (e) { console.error('Trigger failed', e); }
    }

    // ── Resize ───────────────────────────────────────────────────

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(state.agents), 150);
    });

    document.getElementById('footer-port').textContent = `port ${location.port || 4242}`;
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads in a browser**

```bash
node dashboard/server.js &
SERVER_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:4242/
kill $SERVER_PID
```

Expected: `200`

- [ ] **Step 3: Verify run picker shows for an agent with logs**

If `logs/pm.log` has at least one `=== Agent starting ===` line, navigate to `http://localhost:4242/`, click the PM card, and confirm:
- Card grid renders (3 columns on desktop)
- Clicking a card highlights it and opens the log panel below
- Log panel shows `● Live` label
- Run picker shows `← Prev` / `Latest →` if there are multiple runs

- [ ] **Step 4: Commit**

```bash
git add dashboard/index.html
git commit -m "feat: rewrite dashboard with card grid, agent colors, and run-picker log panel"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Agent identity table (color/emoji/role for all 5 agents) | Task 3 — `AGENT_CONFIG` |
| 3-col desktop grid, 2-col tablet, 1-col mobile | Task 3 — CSS Grid + media queries |
| 5px left border in agent color | Task 3 — `border-left: 5px solid var(--agent-color)` |
| Selected card: full-color highlight + tinted background | Task 3 — `.agent-card.selected` with `outline` + `color-mix()` |
| Run button disabled when busy | Task 3 — `${agent.status === 'busy' ? 'disabled' : ''}` |
| Full-width log panel below grid (desktop) | Task 3 — `#log-panel` below `#agent-grid` |
| Mobile inline log toggle | Task 3 — `card-log-inline` |
| SSE starts from last `=== Agent starting ===` | Task 2 — modified SSE tail |
| `GET /logs/{agent}/runs` endpoint | Task 2 |
| `GET /logs/{agent}/runs/{index}` endpoint | Task 2 |
| Run picker with `← Prev / Run N — date / Latest →` | Task 3 — `#run-picker` + `navigateRun()` |
| `● Live` indicator in live mode | Task 3 — `#log-live-label` |
| `STARTING_RE`/`DONE_RE` available in server.js | Task 1 |
| Legacy run as index 0 (pre-first-run content) | Task 2 — `parseRuns()` |
| Oldest run's Prev button greyed out | Task 3 — `isOldest` check |
| Latest/Live's Next button greyed out | Task 3 — `isLatest` check |

All spec requirements covered.

### Placeholder scan

No TBD, TODO, or incomplete steps found.

### Type consistency

- `allRuns` entries: `{ index, startedAt, summary }` — used consistently in `updateRunPicker()`, `navigateRun()`, `loadStaticRun()`
- `viewingIdx`: `null` = live mode, `number` = run index — used consistently throughout
- `parseRuns` returns `{ index, startedAt, summary }[]` (internal `startLine`/`endLine` stripped before returning) — matches what the endpoint serves and what the frontend consumes
