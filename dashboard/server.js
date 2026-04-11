'use strict';
const express  = require('express');
const https    = require('node:https');
const http     = require('node:http');
const crypto   = require('node:crypto');
const fs       = require('node:fs');
const path     = require('node:path');
const { spawn, execSync } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { getAllAgentStatuses, isAgentBusy, listRunFiles, AGENTS, STARTING_RE, DONE_RE, LOG_DIR } = require('./status.js');

const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET || '';
const LINEAR_API_KEY        = process.env.LINEAR_API_KEY || '';

/* ─── Pause ──────────────────────────────────────────────────── */

const PAUSE_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/company.pause';

function readPauseState() {
  if (!fs.existsSync(PAUSE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(PAUSE_FILE, 'utf8'));
    if (data.resumeAt && new Date(data.resumeAt) <= new Date()) {
      fs.unlinkSync(PAUSE_FILE);
      console.log('[dashboard] Auto-resumed (schedule elapsed)');
      return null;
    }
    return data;
  } catch {
    return { pausedAt: new Date().toISOString(), resumeAt: null };
  }
}

function isPaused() { return readPauseState() !== null; }

/* ─── Agent Queue (slow mode) ────────────────────────────────── */

const REST_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/rest-duration.json';
const REST_STATE_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/rest-state.json';
const MODELS_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/agent-models.json';
const PROGRAMMER_FLAGS_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/programmer-flags.json';
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
const DEFAULT_MODELS = { pm: 'haiku', cto: 'sonnet', designer: 'sonnet', programmer: 'sonnet' };
const DEFAULT_REST_MS = 15 * 60 * 1000; // 15 minutes

function readAgentModels() {
  try {
    return { ...DEFAULT_MODELS, ...JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_MODELS };
  }
}

function saveAgentModels(models) {
  fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2) + '\n');
}

function readRestDuration() {
  try {
    const data = JSON.parse(fs.readFileSync(REST_FILE, 'utf8'));
    return (data.minutes ?? 15) * 60 * 1000;
  } catch {
    return DEFAULT_REST_MS;
  }
}

function saveRestDuration(minutes) {
  fs.writeFileSync(REST_FILE, JSON.stringify({ minutes }));
}

function readProgrammerFlags() {
  try { return JSON.parse(fs.readFileSync(PROGRAMMER_FLAGS_FILE, 'utf8')); } catch { return { skipCodeReview: false, bypassDesignApproval: false }; }
}

function saveProgrammerFlags(flags) {
  fs.writeFileSync(PROGRAMMER_FLAGS_FILE, JSON.stringify(flags, null, 2));
}

function loadRestState() {
  try { return JSON.parse(fs.readFileSync(REST_STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveRestState() {
  const data = {};
  for (const name of AGENTS) data[name] = agentState[name].restUntil;
  fs.writeFileSync(REST_STATE_FILE, JSON.stringify(data));
}

// Per-agent queue state — restore restUntil from disk on startup
const _savedRestState = loadRestState();
const agentState = {};
for (const name of AGENTS) {
  const saved = _savedRestState[name];
  agentState[name] = {
    queue: [],
    restUntil: (saved && saved > Date.now()) ? saved : null,
    lastBusy: false,
  };
}

function enqueueAgent(agent, reason, issueId) {
  if (isPaused()) {
    console.log(`[queue] ${agent} trigger ignored (paused): ${reason}`);
    return 'paused';
  }
  const st = agentState[agent];
  if (!st) return false;
  st.queue.push({ reason, issueId: issueId || null, timestamp: Date.now() });
  console.log(`[queue] ${agent} enqueued: ${reason}${issueId ? ` (${issueId})` : ''} — queue depth: ${st.queue.length}`);
  processQueue(agent);
  return true;
}

function processQueue(agent) {
  const st = agentState[agent];
  if (!st || st.queue.length === 0) return;
  if (isAgentBusy(agent)) return;
  if (st.restUntil && Date.now() < st.restUntil) return;

  // Ready to run — drain queue and spawn
  const events = st.queue.splice(0);
  st.restUntil = null;
  console.log(`[queue] ${agent} dispatching (${events.length} queued events)`);
  spawnAgent(agent);
}

function spawnAgent(agent) {
  const script = `/Volumes/ex-ssd/workspace/mtbox/scripts/run-${agent}.sh`;
  if (!fs.existsSync(script)) return false;
  const child = spawn('bash', [script], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PATH: '/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      HOME: '/Users/lelinh',
      MTBOX_SKIP_PRECHECK: '1',  // queue-triggered = work guaranteed
    },
  });
  child.unref();
  return true;
}

// Poll agent status files to detect idle transitions → start rest timer
setInterval(() => {
  const restMs = readRestDuration();
  for (const name of AGENTS) {
    const st = agentState[name];
    const busy = isAgentBusy(name);

    // Detect busy→idle transition: agent just finished
    if (st.lastBusy && !busy) {
      st.restUntil = Date.now() + restMs;
      saveRestState();
      console.log(`[queue] ${name} finished → resting ${restMs / 60000}min (until ${new Date(st.restUntil).toLocaleTimeString()})`);

      // Schedule queue processing after rest
      setTimeout(() => processQueue(name), restMs + 500);
    }

    st.lastBusy = busy;
  }
}, 3000);

// Also check queues every 30s in case a setTimeout was missed
setInterval(() => {
  for (const name of AGENTS) processQueue(name);
}, 30000);

/* ─── Design Clearance auto-approval ─────────────────────────── */

async function tryAutoApproveDesignClearance(issueId) {
  if (!LINEAR_API_KEY) return false;
  const query = `{
    issue(id: "${issueId}") {
      identifier
      comments(first: 10, orderBy: createdAt) {
        nodes { body }
      }
    }
  }`;
  return new Promise((resolve) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': LINEAR_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const comments = json.data?.issue?.comments?.nodes || [];
          const identifier = json.data?.issue?.identifier || issueId;
          const hasClearance = comments.some(c =>
            c.body && c.body.includes('[Designer]') && c.body.includes('Design Clearance')
          );
          if (!hasClearance) return resolve(false);

          console.log(`[webhook] Auto-approving design clearance for ${identifier}`);
          const linearSh = '/Volumes/ex-ssd/workspace/mtbox/scripts/linear.sh';
          const env = { ...process.env, LINEAR_API_KEY };
          try {
            execSync(`bash "${linearSh}" comment "${identifier}" "🏗️ [CTO] ✅ Design clearance auto-approved — no visual review needed for code-only cleanup. Moving to In Progress."`, { env, timeout: 15000 });
            execSync(`bash "${linearSh}" move "${identifier}" "In Progress"`, { env, timeout: 15000 });
            resolve(true);
          } catch (e) {
            console.error(`[webhook] Auto-approve failed for ${identifier}:`, e.message);
            resolve(false);
          }
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

/* ─── Log run helpers ─────────────────────────────────────────── */

/** Build run metadata from a log filename (e.g. "2026-04-10_14-30-00.log"). */
function parseRunMeta(filename, logDir) {
  const ts = filename.replace('.log', '').replace(/_/g, ' ').replace(/-/g, (m, offset) => offset <= 9 ? '-' : ':');
  let startedAt = null;
  try { startedAt = new Date(ts).toISOString(); } catch {}

  let summary = null;
  try {
    const content = fs.readFileSync(path.join(logDir, filename), 'utf8');
    const lines = content.split('\n');
    const doneIdx = lines.findIndex(l => DONE_RE.test(l));
    if (doneIdx !== -1) {
      for (let i = doneIdx - 1; i >= 0; i--) {
        const m = lines[i].match(/💬\s+(.+)/);
        if (m) { summary = m[1].trim(); break; }
      }
    }
  } catch {}

  return { file: filename, startedAt, summary };
}

/* ─── HMAC verification ───────────────────────────────────────── */

function verifyLinearSignature(body, signature) {
  if (!LINEAR_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', LINEAR_WEBHOOK_SECRET);
  hmac.update(body);
  const digest = hmac.digest('hex');
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return digest === signature;
  }
}

/* ─── Agent mention detection ─────────────────────────────────── */

const AGENT_NAME_MAP_GLOBAL = { ada: 'pm', turing: 'cto', vera: 'designer', linus: 'programmer' };
const AGENT_USER_IDS_GLOBAL = {
  '27e2451c-cdb4-4c1e-bf99-204559cbd41d': 'designer', // levulinhkrdesigner / Vera
};

function extractAgentMentions(text) {
  const mentioned = new Set();
  // @role / @name style
  const mentionRe = /@\w*(pm|cto|designer|programmer|ada|turing|vera|linus)\b/gi;
  let m;
  while ((m = mentionRe.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    mentioned.add(AGENT_NAME_MAP_GLOBAL[key] || key);
  }
  // Linear native tag: <user id="...">username</user>
  const userTagRe = /<user id="([^"]+)">([^<]*)<\/user>/gi;
  while ((m = userTagRe.exec(text)) !== null) {
    const userId = m[1];
    const username = m[2].toLowerCase();
    if (AGENT_USER_IDS_GLOBAL[userId]) {
      mentioned.add(AGENT_USER_IDS_GLOBAL[userId]);
    } else {
      for (const [key, agent] of Object.entries(AGENT_NAME_MAP_GLOBAL)) {
        if (username.includes(key)) { mentioned.add(agent); break; }
      }
      if (username.includes('designer'))   mentioned.add('designer');
      if (username.includes('programmer')) mentioned.add('programmer');
      if (username.includes('pm'))         mentioned.add('pm');
      if (username.includes('cto'))        mentioned.add('cto');
    }
  }
  return mentioned;
}

/* ─── Express app ─────────────────────────────────────────────── */

const STATUS_TO_AGENT = {
  'In Design':                 'designer',
  'Awaiting Design Approval':  'cto',
  'In Progress':               'programmer',
};

const isProd = process.env.NODE_ENV === 'production';
const PORT   = isProd ? (process.env.PORT || 4242) : (process.env.PORT || 4243);
const HOST   = '0.0.0.0';

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// JSON body parser for most routes (applied selectively below)
// We do NOT apply express.json() globally because the webhook needs raw body

/* ─── Routes ──────────────────────────────────────────────────── */

// GET /api/status
app.get('/api/status', (req, res) => {
  const agents = getAllAgentStatuses();
  const restMs = readRestDuration();
  const now = Date.now();

  const enriched = agents.map(a => {
    const st = agentState[a.name];
    const resting = st.restUntil && now < st.restUntil;
    return {
      ...a,
      queueDepth: st.queue.length,
      queueEvents: st.queue.slice(-10),
      resting,
      restUntil: st.restUntil,
      restRemaining: resting ? Math.max(0, Math.ceil((st.restUntil - now) / 1000)) : null,
    };
  });

  const pauseState = readPauseState();
  const models = readAgentModels();
  res.json({
    agents: enriched,
    serverTime: now,
    paused: pauseState !== null,
    pausedUntil: pauseState?.resumeAt || null,
    restMinutes: restMs / 60000,
    models,
    programmerFlags: readProgrammerFlags(),
  });
});

// POST /api/rest-duration
app.post('/api/rest-duration', express.json(), (req, res) => {
  const { minutes } = req.body || {};
  if (typeof minutes === 'number' && minutes >= 0) {
    saveRestDuration(minutes);
    console.log(`[dashboard] Rest duration set to ${minutes} minutes`);
    return res.json({ ok: true, minutes });
  }
  res.status(400).json({ ok: false, error: 'Invalid minutes' });
});

// GET /api/models
app.get('/api/models', (req, res) => {
  res.json(readAgentModels());
});

// POST /api/models/:agent
app.post('/api/models/:agent', express.json(), (req, res) => {
  const { agent } = req.params;
  const { model } = req.body || {};
  if (!AGENTS.includes(agent)) return res.status(400).json({ ok: false, error: 'Unknown agent' });
  if (!VALID_MODELS.includes(model)) return res.status(400).json({ ok: false, error: `Invalid model. Valid: ${VALID_MODELS.join(', ')}` });
  const models = readAgentModels();
  models[agent] = model;
  saveAgentModels(models);
  console.log(`[dashboard] ${agent} model set to ${model}`);
  res.json({ ok: true, agent, model });
});

// POST /api/programmer-flags — update programmer feature flags
app.post('/api/programmer-flags', express.json(), (req, res) => {
  const flags = readProgrammerFlags();
  if (typeof req.body?.skipCodeReview === 'boolean') flags.skipCodeReview = req.body.skipCodeReview;
  if (typeof req.body?.bypassDesignApproval === 'boolean') flags.bypassDesignApproval = req.body.bypassDesignApproval;
  saveProgrammerFlags(flags);
  res.json({ ok: true, flags });
});

// POST /api/kill/:agent — terminate a running agent
app.post('/api/kill/:agent', (req, res) => {
  const { agent } = req.params;
  if (!AGENTS.includes(agent)) return res.status(400).json({ ok: false, error: 'Unknown agent' });
  if (!isAgentBusy(agent)) return res.json({ ok: false, error: 'Agent is not running' });

  const lockFile = path.join(require('./status.js').STATUS_DIR, `${agent}.lock`);
  let pid;
  try { pid = parseInt(fs.readFileSync(lockFile, 'utf8').trim(), 10); } catch {
    return res.status(500).json({ ok: false, error: 'Could not read lock file' });
  }

  try {
    // Kill the entire process group (negative PID) — covers bash + claude + stream parser
    process.kill(-pid, 'SIGTERM');
    console.log(`[dashboard] Killed ${agent} agent (pgid ${pid})`);
  } catch (e) {
    // Process group kill failed — try killing just the PID
    try { process.kill(pid, 'SIGTERM'); } catch {}
    console.log(`[dashboard] Killed ${agent} agent (pid ${pid}, group kill failed)`);
  }

  // Give trap handler 2s to clean up, then force-remove lock if still there
  setTimeout(() => {
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch {}
      try { fs.writeFileSync(path.join(require('./status.js').STATUS_DIR, `${agent}.status`), 'idle'); } catch {}
      console.log(`[dashboard] Force-cleaned lock for ${agent}`);
    }
  }, 2000);

  res.json({ ok: true, agent, pid });
});

// POST /api/queue/:agent/clear
app.post('/api/queue/:agent/clear', (req, res) => {
  const { agent } = req.params;
  if (agentState[agent]) {
    agentState[agent].queue = [];
    console.log(`[queue] ${agent} queue cleared`);
  }
  res.json({ ok: true });
});

// POST /api/queue/:agent/skip-rest
app.post('/api/queue/:agent/skip-rest', (req, res) => {
  const { agent } = req.params;
  if (agentState[agent]) {
    agentState[agent].restUntil = null;
    console.log(`[queue] ${agent} rest skipped`);
    processQueue(agent);
  }
  res.json({ ok: true });
});

// POST /pause
app.post('/pause', express.json(), (req, res) => {
  let resumeAt = null;
  try {
    if (req.body && req.body.resumeAt) resumeAt = new Date(req.body.resumeAt).toISOString();
  } catch {}
  const pauseData = { pausedAt: new Date().toISOString(), resumeAt };
  fs.writeFileSync(PAUSE_FILE, JSON.stringify(pauseData));
  console.log(`[dashboard] Company paused${resumeAt ? ` until ${resumeAt}` : ' indefinitely'}`);
  res.json({ ok: true, paused: true, pausedUntil: resumeAt });
});

// POST /resume
app.post('/resume', (req, res) => {
  try { fs.unlinkSync(PAUSE_FILE); } catch {}
  console.log('[dashboard] Company resumed');
  for (const name of AGENTS) processQueue(name);
  res.json({ ok: true, paused: false });
});

// GET /logs/:agent/runs — list all runs (newest first)
app.get('/logs/:agent/runs', (req, res) => {
  const { agent } = req.params;
  if (!AGENTS.includes(agent)) return res.status(400).send('Unknown agent');
  const agentLogDir = path.join(LOG_DIR, agent);
  const files = listRunFiles(agent);
  const runs = files.map(f => parseRunMeta(f, agentLogDir));
  res.json(runs);
});

// GET /logs/:agent/runs/:file — read a specific run log
app.get('/logs/:agent/runs/:file', (req, res) => {
  const { agent, file } = req.params;
  if (!AGENTS.includes(agent)) return res.status(400).send('Unknown agent');
  if (!file.endsWith('.log') || file.includes('/') || file.includes('..')) return res.status(400).send('Invalid file');
  const logFile = path.join(LOG_DIR, agent, file);
  try {
    const text = fs.readFileSync(logFile, 'utf8');
    res.type('text/plain').send(text);
  } catch {
    res.status(404).send('Run not found');
  }
});

// GET /logs/:agent  — SSE stream (tails the latest symlink)
app.get('/logs/:agent', (req, res) => {
  const { agent } = req.params;
  if (!AGENTS.includes(agent)) return res.status(400).send('Unknown agent');

  const latestLog = path.join(LOG_DIR, agent, 'latest');
  if (!fs.existsSync(latestLog)) {
    const dir = path.join(LOG_DIR, agent);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(latestLog, '');  // create as regular file; next run will replace with symlink
  }

  if (req.socket) req.socket.setNoDelay(true);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const tail = spawn('tail', ['-n', '200', '-f', latestLog]);
  tail.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) res.write(`data: ${line}\n\n`);
    }
  });
  tail.stderr.on('data', (chunk) => {
    console.error(`[dashboard] tail error for ${agent}:`, chunk.toString().trim());
  });
  tail.on('close', () => res.end());

  const keepalive = setInterval(() => {
    if (!res.destroyed) res.write(': ping\n\n');
  }, 5000);

  req.on('close', () => { tail.kill(); clearInterval(keepalive); });
});

// POST /trigger/:agent — manual trigger (or agent self-trigger via ?reason=...)
app.post('/trigger/:agent', express.json(), (req, res) => {
  const { agent } = req.params;
  if (!AGENTS.includes(agent)) return res.status(400).send('Unknown agent');

  if (isPaused()) {
    return res.json({ ok: false, paused: true });
  }

  const reason = req.body?.reason || req.query?.reason || 'Manual trigger';
  const st = agentState[agent];
  st.restUntil = null; // skip rest for manual triggers
  st.queue.push({ reason, issueId: null, timestamp: Date.now() });
  processQueue(agent);

  res.json({ ok: true, agent });
});

// POST /webhook/linear — raw body for HMAC verification
app.post('/webhook/linear', express.raw({ type: '*/*' }), async (req, res) => {
  const body = req.body;
  const signature = req.headers['linear-signature'] || '';

  if (LINEAR_WEBHOOK_SECRET && !verifyLinearSignature(body, signature)) {
    console.error('[webhook] Invalid Linear signature');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(body.toString()); } catch {
    return res.status(400).send('Bad JSON');
  }

  // Respond immediately (Linear expects < 1s response)
  res.json({ ok: true });

  // Handle comment creation with @agent mention detection
  if (payload.type === 'Comment' && payload.action === 'create') {
    const commentBody = payload.data?.body || '';
    const issueId = payload.data?.issue?.identifier || payload.data?.issueId;
    const commentId = payload.data?.id;
    const authorId = payload.data?.userId;

    const BOT_PREFIXES = ['[PM]', '[CTO]', '[Designer]', '[Programmer]'];
    if (BOT_PREFIXES.some(p => commentBody.includes(p))) return;

    const mentioned = extractAgentMentions(commentBody);

    for (const agentName of mentioned) {
      const contextFile = `/Volumes/ex-ssd/workspace/mtbox/status/${agentName}.mention`;
      fs.writeFileSync(contextFile, JSON.stringify({ issueId, commentId, commentBody, authorId }));
      console.log(`[webhook] @${agentName} mentioned on ${issueId}`);
      // Mentions skip rest — enqueue and clear rest timer
      const st = agentState[agentName];
      if (st) st.restUntil = null;
      enqueueAgent(agentName, `@mention on ${issueId}`, issueId);
    }
    return;
  }

  // Trigger PM when a new issue is created; also check description for agent mentions
  if (payload.type === 'Issue' && payload.action === 'create') {
    const issueId = payload.data?.identifier || payload.data?.id;
    console.log(`[webhook] Issue ${issueId} created`);
    const descMentioned = extractAgentMentions(payload.data?.description || '');
    if (descMentioned.size > 0) {
      for (const agentName of descMentioned) {
        const contextFile = `/Volumes/ex-ssd/workspace/mtbox/status/${agentName}.mention`;
        fs.writeFileSync(contextFile, JSON.stringify({ issueId, commentId: null, commentBody: payload.data?.description || '', authorId: payload.data?.creatorId }));
        console.log(`[webhook] @${agentName} mentioned in description of ${issueId}`);
        const st = agentState[agentName];
        if (st) st.restUntil = null;
        enqueueAgent(agentName, `@mention in ${issueId} description`, issueId);
      }
    } else {
      enqueueAgent('pm', `Issue created: ${issueId}`, issueId);
    }
    return;
  }

  if (payload.type !== 'Issue' || payload.action !== 'update') return;
  if (!payload.updatedFrom || !payload.updatedFrom.stateId) return;

  const stateName = payload.data?.state?.name;
  const issueId = payload.data.identifier || payload.data.id;

  // When an issue moves to Done, trigger CTO to sync roadmap
  if (stateName === 'Done') {
    console.log(`[webhook] Issue ${issueId} → "Done"`);
    enqueueAgent('cto', `Issue Done: ${issueId}`, issueId);
    return;
  }

  const agent = STATUS_TO_AGENT[stateName];
  if (!agent) return;

  // Auto-approve Design Clearance issues (or bypass design approval entirely)
  if (stateName === 'Awaiting Design Approval') {
    const rawId = payload.data?.id || issueId;
    const flags = readProgrammerFlags();
    if (flags.bypassDesignApproval) {
      console.log(`[webhook] Issue ${issueId} → design approval bypassed`);
      const env = { ...process.env, LINEAR_API_KEY };
      const linearSh = '/Volumes/ex-ssd/workspace/mtbox/scripts/linear.sh';
      try {
        execSync(`bash "${linearSh}" comment "${issueId}" "🏗️ [CTO] ✅ Design approval bypassed (setting enabled). Moving to In Progress."`, { env, timeout: 15000 });
        execSync(`bash "${linearSh}" move "${issueId}" "In Progress"`, { env, timeout: 15000 });
      } catch (e) {
        console.error(`[webhook] Bypass move failed for ${issueId}:`, e.message);
      }
      return;
    }
    tryAutoApproveDesignClearance(rawId).then((autoApproved) => {
      if (autoApproved) {
        console.log(`[webhook] Issue ${issueId} → auto-approved design clearance`);
      } else {
        console.log(`[webhook] Issue ${issueId} → "${stateName}"`);
        enqueueAgent(agent, `${issueId} → ${stateName}`, issueId);
      }
    });
    return;
  }

  console.log(`[webhook] Issue ${issueId} → "${stateName}"`);
  enqueueAgent(agent, `${issueId} → ${stateName}`, issueId);
});

/* ─── Static files (production only) ─────────────────────────── */

if (isProd) {
  const distDir = path.join(__dirname, 'dist');
  app.use(express.static(distDir));
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

/* ─── WebSocket log streaming ─────────────────────────────────── */
// SSE is buffered by Cloudflare Quick Tunnel; WebSocket uses HTTP Upgrade which tunnels correctly.

// LOG_DIR imported from status.js

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  const match = req.url?.match(/^\/ws\/logs\/([a-z]+)$/);
  const agent = match?.[1];
  if (!agent || !AGENTS.includes(agent)) { ws.close(1008, 'Unknown agent'); return; }

  const latestLog = path.join(LOG_DIR, agent, 'latest');
  if (!fs.existsSync(latestLog)) {
    const dir = path.join(LOG_DIR, agent);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(latestLog, '');
  }

  const tail = spawn('tail', ['-n', '200', '-f', latestLog]);
  tail.stdout.on('data', (chunk) => {
    if (ws.readyState !== ws.OPEN) return;
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) ws.send(line);
    }
  });
  tail.stderr.on('data', (chunk) => {
    console.error(`[ws] tail error for ${agent}:`, chunk.toString().trim());
  });
  tail.on('close', () => { if (ws.readyState === ws.OPEN) ws.close(); });

  // Keepalive ping every 15s (WebSocket ping frame, not SSE comment)
  const keepalive = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, 15000);

  ws.on('close', () => { tail.kill(); clearInterval(keepalive); });
  ws.on('error', () => { tail.kill(); clearInterval(keepalive); });
});

/* ─── Start ───────────────────────────────────────────────────── */

const httpServer = http.createServer(app);

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/logs/')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT} (${isProd ? 'production' : 'development'})`);
});
