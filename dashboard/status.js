'use strict';
const fs   = require('node:fs');
const path = require('node:path');

const BASE_DIR   = '/Volumes/ex-ssd/workspace/mtbox';
const LOG_DIR    = path.join(BASE_DIR, 'logs');
const STATUS_DIR = path.join(BASE_DIR, 'status');
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const AGENTS     = ['pm', 'cto', 'designer', 'programmer'];

// Regex: matches "[2026-04-04 01:36:13] === X Agent starting ==="
const STARTING_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] === \w+ Agent starting/;
const DONE_RE     = /\] Done\.$/;

/** List run log files for an agent, sorted newest first. */
function listRunFiles(agent) {
  const dir = path.join(LOG_DIR, agent);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.log') && f !== 'latest' && !f.startsWith('.') && f !== 'empty.log')
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Read the latest log file for an agent (via symlink or newest file). */
function readLatestLog(agent) {
  const latest = path.join(LOG_DIR, agent, 'latest');
  try { return fs.readFileSync(latest, 'utf8'); } catch {}
  // Fallback: read newest .log file
  const files = listRunFiles(agent);
  if (files.length === 0) return '';
  try { return fs.readFileSync(path.join(LOG_DIR, agent, files[0]), 'utf8'); } catch { return ''; }
}

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

  const runLines = lines.slice(startIdx + 1, doneIdx);

  // Prefer the last narration line — most recent thing the agent said
  for (let i = runLines.length - 1; i >= 0; i--) {
    const m = runLines[i].match(/💬\s+(.+)/);
    if (m) return m[1].trim();
  }

  // Fall back to first non-timestamp, non-tool line
  for (const line of runLines) {
    const trimmed = line.trim();
    if (trimmed && !/^\[\d{4}-\d{2}-\d{2}/.test(trimmed) && !trimmed.startsWith('→')) return trimmed;
  }
  return null;
}

function isAgentBusy(name) {
  const lockFile = path.join(STATUS_DIR, `${name}.lock`);
  return fs.existsSync(lockFile);
}

function readAgentStatus(name) {
  const statusFile = path.join(STATUS_DIR, `${name}.status`);
  const lockFile   = path.join(STATUS_DIR, `${name}.lock`);

  const hasLock = fs.existsSync(lockFile);
  const pid     = hasLock ? parseInt(fs.readFileSync(lockFile, 'utf8').trim(), 10) : null;
  const runStart = hasLock ? (() => { try { return fs.statSync(lockFile).mtimeMs; } catch { return null; } })() : null;

  let statusRaw = 'never';
  try { statusRaw = fs.readFileSync(statusFile, 'utf8').trim(); } catch {}

  const status = hasLock ? 'busy' : (statusRaw === 'error' ? 'error' : statusRaw === 'idle' ? 'idle' : 'never');

  const logContent = readLatestLog(name);
  const lastRunAt  = parseLastRunAt(logContent);

  return {
    name,
    status,
    pid,
    runStart,
    lastRunAt,
    lastSummary: parseLastSummary(logContent),
    scriptPath: path.join(SCRIPTS_DIR, `run-${name}.sh`),
  };
}

function getAllAgentStatuses() {
  return AGENTS.map(readAgentStatus);
}

module.exports = { parseLastRunAt, parseLastSummary, readAgentStatus, getAllAgentStatuses, isAgentBusy, listRunFiles, readLatestLog, AGENTS, STARTING_RE, DONE_RE, STATUS_DIR, LOG_DIR };
