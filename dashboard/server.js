'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getAllAgentStatuses, AGENTS } = require('./status.js');

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

  if (method === 'GET' && url === '/api/status') {
    const agents = getAllAgentStatuses();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ agents, serverTime: Date.now() }));
  }

  const logMatch = url.match(/^\/logs\/([a-z]+)$/);
  if (method === 'GET' && logMatch) {
    const agent = logMatch[1];
    if (!AGENTS.includes(agent)) { res.writeHead(400); return res.end('Unknown agent'); }

    const logFile = `/Volumes/ex-ssd/workspace/mtbox/logs/${agent}.log`;

    // Create file if it doesn't exist so tail -f doesn't error
    if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});
