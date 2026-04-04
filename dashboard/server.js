'use strict';
const http   = require('node:http');
const crypto = require('node:crypto');
const fs     = require('node:fs');
const path   = require('node:path');
const { spawn } = require('node:child_process');
const { getAllAgentStatuses, AGENTS, STARTING_RE, DONE_RE } = require('./status.js');

// Linear webhook signing secret (set via LINEAR_WEBHOOK_SECRET env var)
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET || '';

const PAUSE_FILE = '/Volumes/ex-ssd/workspace/mtbox/status/company.pause';
function isPaused() { return fs.existsSync(PAUSE_FILE); }

// Map Linear workflow state names to agent names
const STATUS_TO_AGENT = {
  'In Design':                 'designer',
  'Awaiting Design Approval':  'cto',
  'In Progress':               'programmer',
  'In Review':                 'qa',
};

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

function parseRunBoundaries(logContent) {
  if (!logContent) return [{ index: 0, startLine: 0, endLine: 0 }];
  const lines = logContent.split('\n');
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
  return boundaries;
}

function parseRuns(logContent) {
  if (!logContent) return [];
  const lines = logContent.split('\n');
  const boundaries = parseRunBoundaries(logContent);

  return boundaries
    .slice()
    .reverse()
    .map(({ index, startLine, endLine }) => {
      if (index === 0 && boundaries[0].startLine === 0 && !STARTING_RE.test(lines[0])) {
        // Legacy block
        return { index, startedAt: null, summary: 'Legacy' };
      }
      const m = lines[startLine] && lines[startLine].match(STARTING_RE);
      const startedAt = m ? new Date(m[1].replace(' ', 'T')).toISOString() : null;
      let summary = null;
      const runLines = lines.slice(startLine, endLine + 1);
      const doneIdx = runLines.findIndex(l => DONE_RE.test(l));
      if (doneIdx !== -1) {
        for (let i = 1; i < doneIdx; i++) {
          const trimmed = runLines[i].trim();
          if (trimmed && !/^\[\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            summary = trimmed;
            break;
          }
        }
      }
      return { index, startedAt, summary };
    });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function verifyLinearSignature(body, signature) {
  if (!LINEAR_WEBHOOK_SECRET) return true; // skip if no secret configured
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', LINEAR_WEBHOOK_SECRET);
  hmac.update(body);
  const digest = hmac.digest('hex');
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function triggerAgent(agent) {
  if (isPaused()) return 'paused';
  const script = `/Volumes/ex-ssd/workspace/mtbox/scripts/run-${agent}.sh`;
  if (!fs.existsSync(script)) return false;
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
  return true;
}

const server = http.createServer(async (req, res) => {
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
    return res.end(JSON.stringify({ agents, serverTime: Date.now(), paused: isPaused() }));
  }

  if (method === 'POST' && url === '/pause') {
    fs.writeFileSync(PAUSE_FILE, new Date().toISOString());
    console.log('[dashboard] Company paused');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ok: true, paused: true }));
  }

  if (method === 'POST' && url === '/resume') {
    try { fs.unlinkSync(PAUSE_FILE); } catch {}
    console.log('[dashboard] Company resumed');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ ok: true, paused: false }));
  }

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

  const runItemMatch = url.match(/^\/logs\/([a-z]+)\/runs\/(\d+)$/);
  if (method === 'GET' && runItemMatch) {
    const agent = runItemMatch[1];
    const idx   = parseInt(runItemMatch[2], 10);
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }
    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;
    let logContent = '';
    try { logContent = fs.readFileSync(logFile, 'utf8'); } catch {}
    const lines = logContent.split('\n');
    const boundaries = parseRunBoundaries(logContent);
    const run = boundaries.find(r => r.index === idx);
    if (!run) { res.writeHead(404); return res.end('Run not found'); }

    const text = lines.slice(run.startLine, run.endLine + 1).join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(text);
  }

  const logMatch = url.match(/^\/logs\/([a-z]+)$/);
  if (method === 'GET' && logMatch) {
    const agent = logMatch[1];
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }

    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;

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

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');

    const tail = spawn('tail', tailArgs);

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

    req.on('close', () => tail.kill());
    return;
  }

  const triggerMatch = url.match(/^\/trigger\/([a-z]+)$/);
  if (method === 'POST' && triggerMatch) {
    const agent = triggerMatch[1];
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }

    const result = triggerAgent(agent);
    if (result === 'paused') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, paused: true }));
    }
    if (!result) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: `Script not found: run-${agent}.sh` }));
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ ok: true, agent }));
  }

  // Linear webhook: triggers agents based on issue status transitions
  if (method === 'POST' && url === '/webhook/linear') {
    const body = await readBody(req);
    const signature = req.headers['linear-signature'] || '';

    if (LINEAR_WEBHOOK_SECRET && !verifyLinearSignature(body, signature)) {
      console.error('[webhook] Invalid Linear signature');
      res.writeHead(401);
      return res.end('Invalid signature');
    }

    let payload;
    try { payload = JSON.parse(body.toString()); } catch {
      res.writeHead(400);
      return res.end('Bad JSON');
    }

    // Respond immediately (Linear expects < 1s response)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

    // Only act on issue updates with a state change
    if (payload.type !== 'Issue' || payload.action !== 'update') return;
    if (!payload.updatedFrom || !payload.updatedFrom.stateId) return;

    const stateName = payload.data?.state?.name;
    const agent = STATUS_TO_AGENT[stateName];
    if (!agent) return;

    console.log(`[webhook] Issue ${payload.data.identifier || payload.data.id} → "${stateName}" → triggering ${agent}`);
    triggerAgent(agent);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});
