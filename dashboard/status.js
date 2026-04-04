'use strict';
const fs   = require('node:fs');
const path = require('node:path');

const BASE_DIR   = '/Volumes/ex-ssd/workspace/mtbox';
const LOG_DIR    = path.join(BASE_DIR, 'logs');
const STATUS_DIR = path.join(BASE_DIR, 'status');
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const AGENTS     = ['pm', 'cto', 'designer', 'programmer', 'qa'];
const INTERVAL   = 900; // seconds

// Regex: matches "[2026-04-04 01:36:13] === X Agent starting ==="
const STARTING_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] === \w+ Agent starting ===/;
const DONE_RE     = /\] Done\.$/;

function parseLastRunAt(logContent) {
  if (!logContent) return null;
  const lines = logContent.split('\n');
  let lastMatch = null;
  for (const line of lines) {
    const m = line.match(STARTING_RE);
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
    if (STARTING_RE.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) return null;
  const doneIdx = lines.findIndex((l, i) => i > startIdx && DONE_RE.test(l));
  if (doneIdx === -1) return null;
  for (let i = startIdx + 1; i < doneIdx; i++) {
    const trimmed = lines[i].trim();
    // Skip lines that are internal timestamp log lines (e.g. "[2026-04-04 01:36:13] ...")
    if (trimmed && !/^\[\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
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

module.exports = { parseLastRunAt, parseLastSummary, readAgentStatus, getAllAgentStatuses, AGENTS, STARTING_RE, DONE_RE };
