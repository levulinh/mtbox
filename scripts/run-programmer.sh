#!/bin/bash
AGENT="programmer"
PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}.log"
LOCK_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.lock"
STATUS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.status"

if [ -f "$LOCK_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo "$AGENT" | tr '[:lower:]' '[:upper:]') agent is busy (PID $(cat "$LOCK_FILE")), skipping." >> "$LOG_FILE"
    exit 0
fi

echo $$ > "$LOCK_FILE"
echo "busy" > "$STATUS_FILE"

trap 'rm -f "$LOCK_FILE"; echo "idle" > "$STATUS_FILE"; echo "[$(date "+%Y-%m-%d %H:%M:%S")] Done." >> "$LOG_FILE"; echo "" >> "$LOG_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Programmer Agent starting ===" >> "$LOG_FILE"

PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
HOME="/Users/lelinh" \
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" >> "$LOG_FILE" 2>&1
