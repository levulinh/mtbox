'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getAllAgentStatuses, AGENTS, STARTING_RE, DONE_RE } = require('./status.js');

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

function parseRuns(logContent) {
  if (!logContent) return [];
  const lines = logContent.split('\n');
  const runs = [];
  let firstStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STARTING_RE);
    if (m) {
      if (firstStartLine === -1 && i > 0) {
        // Everything before the first === starting === is "Legacy" run (index 0)
        runs.push({ index: 0, startedAt: null, summary: 'Legacy', startLine: 0, endLine: i - 1 });
      } else if (runs.length > 0) {
        // Close the previous run
        runs[runs.length - 1].endLine = i - 1;
      }
      const startedAt = new Date(m[1].replace(' ', 'T')).toISOString();
      runs.push({ index: runs.length, startedAt, summary: null, startLine: i, endLine: lines.length - 1 });
      firstStartLine = i;
    }
  }

  if (runs.length === 0) {
    // No runs found at all — return a single legacy block covering everything
    return [{ index: 0, startedAt: null, summary: 'Legacy', startLine: 0, endLine: lines.length - 1 }];
  }

  // Fill summaries for each run
  for (const run of runs) {
    if (run.startedAt === null) continue;
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

  // Return latest first, strip internal line tracking fields
  return runs
    .slice()
    .reverse()
    .map(({ index, startedAt, summary }) => ({ index, startedAt, summary }));
}

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

    // Rebuild run boundaries
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

    const script = `/Volumes/ex-ssd/workspace/mtbox/scripts/run-${agent}.sh`;
    if (!fs.existsSync(script)) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: `Script not found: run-${agent}.sh` }));
    }
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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});
