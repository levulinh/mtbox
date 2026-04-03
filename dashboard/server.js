'use strict';
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { getAllAgentStatuses } = require('./status.js');

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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});
