#!/bin/bash
AGENT="cto"
PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/cto-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}.log"
LOCK_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.lock"
STATUS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.status"

# Skip if already running
if [ -f "$LOCK_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo "$AGENT" | tr '[:lower:]' '[:upper:]') agent is busy (PID $(cat "$LOCK_FILE")), skipping." | tee -a "$LOG_FILE"
    exit 0
fi

# Acquire lock
echo $$ > "$LOCK_FILE"
echo "busy" > "$STATUS_FILE"

# Release lock on exit (success or error)
trap 'rm -f "$LOCK_FILE"; echo "idle" > "$STATUS_FILE"; echo "[$(date "+%Y-%m-%d %H:%M:%S")] Done." | tee -a "$LOG_FILE"; echo "" | tee -a "$LOG_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === CTO Agent starting ===" | tee -a "$LOG_FILE"

PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
HOME="/Users/lelinh" \
/Users/lelinh/.local/bin/claude \
  --print \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --max-turns 80 \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" 2>/dev/null | node /Volumes/ex-ssd/workspace/mtbox/scripts/claude-stream.js | tee -a "$LOG_FILE"
