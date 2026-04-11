#!/usr/bin/env node
'use strict';
// Reads claude --output-format stream-json from stdin,
// emits human-readable lines: tool calls as they happen, final result at end.
// Narration lines (💬) are written directly to the log by log.sh — this file
// handles fallback formatting for un-narrated tool calls.
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const seenTools = new Set();

// Emit a timestamped line
// lastOutputTime tracks REAL tool/result activity — heartbeat lines must not reset it
let lastOutputTime = Date.now();
function emit(line, isHeartbeat = false) {
  if (!isHeartbeat) lastOutputTime = Date.now();
  console.log(line);
}

const startTime = Date.now();
const MAX_IDLE_MS  = 30 * 60 * 1000; // 30 min idle → kill
const MAX_TOTAL_MS = 90 * 60 * 1000; // 90 min total → kill

// Heartbeat: if no tool events for 5+ minutes, log a "still running" line
// If idle >30 min or total >90 min, kill the process so the lock is released.
const heartbeatInterval = setInterval(() => {
  const idleMs  = Date.now() - lastOutputTime;
  const totalMs = Date.now() - startTime;
  const elapsed = Math.floor(idleMs / 1000);
  if (elapsed >= 300) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    emit(`[${ts}] ⟳ running (${Math.floor(elapsed / 60)}m ${elapsed % 60}s, awaiting API response)`, true);
  }
  if (idleMs >= MAX_IDLE_MS || totalMs >= MAX_TOTAL_MS) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const reason = idleMs >= MAX_IDLE_MS ? `idle >${MAX_IDLE_MS/60000}min` : `total >${MAX_TOTAL_MS/60000}min`;
    emit(`[${ts}] ✗ Timeout (${reason}) — exiting so lock is released.`, true);
    clearInterval(heartbeatInterval);
    process.exit(1);
  }
}, 60000);

rl.on('close', () => clearInterval(heartbeatInterval));

function basename(p) {
  return (p || '').split('/').pop();
}

function formatTool(block) {
  const inp = block.input || {};
  switch (block.name) {
    case 'Bash': {
      const cmd = (inp.command || '').trim();
      // Suppress log.sh calls — they write narration directly, no need to echo them
      if (cmd.includes('log.sh')) return null;
      // Readable one-liner fallbacks
      const first = cmd.split('\n')[0].trim();
      if (/^(cat|head|tail)\s/.test(first)) {
        const file = first.split(/\s+/)[1] || '';
        return `→ reading ${basename(file)}`;
      }
      if (first.startsWith('git '))    return `→ git ${first.slice(4, 60)}`;
      if (first.startsWith('flutter ')) return `→ flutter ${first.split(' ').slice(1, 3).join(' ')}`;
      if (first.startsWith('gh pr '))  return `→ gh pr ${first.slice(6, 60)}`;
      if (first.startsWith('gh '))     return `→ gh ${first.slice(3, 60)}`;
      if (first.startsWith('node '))   return `→ node ${basename(first.split(' ')[1])}`;
      if (first.startsWith('bash '))   return `→ ${first.slice(0, 80)}`;
      if (first.startsWith('rm '))     return `→ rm ${first.slice(3, 60)}`;
      if (first.startsWith('curl '))   return `→ curl ${first.slice(5, 60)}`;
      return `→ ${first.slice(0, 100)}`;
    }
    case 'Read':   return `→ reading ${basename(inp.file_path)}`;
    case 'Write':  return `→ writing ${basename(inp.file_path)}`;
    case 'Edit':   return `→ editing ${basename(inp.file_path)}`;
    case 'Glob':   return `→ glob ${inp.pattern || ''}`;
    case 'Grep':   return `→ grep "${inp.pattern || ''}"${inp.path ? ` in ${basename(inp.path)}` : ''}`;
    case 'Agent':  return `→ spawning subagent: ${(inp.description || '').slice(0, 60)}`;
    case 'TodoWrite': return null; // internal plumbing, skip
    case 'ToolSearch': return null;
    default: {
      const name = block.name
        .replace('mcp__claude_ai_Linear__', 'Linear/')
        .replace('mcp__plugin_github_github__', 'GitHub/')
        .replace('mcp__', '');
      const firstKey = Object.keys(inp)[0];
      const preview = firstKey ? String(inp[firstKey]).slice(0, 60) : '';
      return `→ ${name}${preview ? ` (${preview})` : ''}`;
    }
  }
}

rl.on('line', line => {
  try {
    const e = JSON.parse(line);
    if (e.type === 'assistant') {
      for (const block of (e.message && e.message.content) || []) {
        if (block.type === 'tool_use' && !seenTools.has(block.id)) {
          seenTools.add(block.id);
          const formatted = formatTool(block);
          if (formatted !== null) emit(formatted);
        }
      }
    }
    if (e.type === 'result' && e.result) {
      emit(e.result);
    }
  } catch (_) {}
});
