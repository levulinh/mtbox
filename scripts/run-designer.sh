#!/bin/bash
AGENT="designer"
PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}.log"
LOCK_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.lock"
STATUS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.status"

if [ -f "$LOCK_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo "$AGENT" | tr '[:lower:]' '[:upper:]') agent is busy (PID $(cat "$LOCK_FILE")), skipping." | tee -a "$LOG_FILE"
    exit 0
fi

echo $$ > "$LOCK_FILE"
echo "busy" > "$STATUS_FILE"

trap 'rm -f "$LOCK_FILE"; echo "idle" > "$STATUS_FILE"; echo "[$(date "+%Y-%m-%d %H:%M:%S")] Done." | tee -a "$LOG_FILE"; echo "" | tee -a "$LOG_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Designer Agent starting ===" | tee -a "$LOG_FILE"

NODE_PATH=/opt/homebrew/lib/node_modules \
PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
HOME="/Users/lelinh" \
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*,mcp__plugin_playwright_playwright__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" 2>&1 | tee -a "$LOG_FILE"
