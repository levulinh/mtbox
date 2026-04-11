#!/bin/bash
AGENT="pm"
PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md"
LOG_DIR="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}"
LOG_FILE="${LOG_DIR}/$(date '+%Y-%m-%d_%H-%M-%S').log"
LOG_LATEST="${LOG_DIR}/latest"
mkdir -p "$LOG_DIR"
ln -sf "$LOG_FILE" "$LOG_LATEST"
LOCK_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.lock"
STATUS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.status"
MENTION_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.mention"
PRECHECK_SCRIPT="/Volumes/ex-ssd/workspace/mtbox/scripts/linear-precheck.sh"

export LINEAR_API_KEY="REDACTED_LINEAR_API_KEY_PM"
export PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/lelinh"

# Skip if already running — verify PID is alive (auto-clean stale locks)
if [ -f "$LOCK_FILE" ]; then
    EXISTING_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$EXISTING_PID" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo "$AGENT" | tr '[:lower:]' '[:upper:]') agent is busy (PID $EXISTING_PID), skipping." | tee -a "$LOG_FILE"
        exit 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stale lock detected (PID $EXISTING_PID dead) — cleaning up." | tee -a "$LOG_FILE"
        rm -f "$LOCK_FILE"
        echo "idle" > "$STATUS_FILE"
    fi
fi

# Acquire lock
echo $$ > "$LOCK_FILE"
echo "busy" > "$STATUS_FILE"

# Release lock on exit
trap '
  rm -f "$LOCK_FILE"
  echo "idle" > "$STATUS_FILE"
  echo "[$(date "+%Y-%m-%d %H:%M:%S")] Done." | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
' EXIT

# Pre-check: skip Claude invocation if no work and no mention
if [ ! -f "$MENTION_FILE" ] && [ -z "$MTBOX_SKIP_PRECHECK" ]; then
    if ! bash "$PRECHECK_SCRIPT" "$AGENT" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [precheck] No work found for $AGENT, skipping Claude invocation." | tee -a "$LOG_FILE"
        exit 0
    fi
fi

MODELS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/agent-models.json"
AGENT_MODEL=$(node -e "try{const m=JSON.parse(require('fs').readFileSync('$MODELS_FILE','utf8'));console.log(m['$AGENT']||'haiku')}catch{console.log('haiku')}" 2>/dev/null)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === PM Agent starting (model: $AGENT_MODEL) ===" | tee -a "$LOG_FILE"

/Users/lelinh/.local/bin/claude \
  --print \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__list_comments,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_projects,mcp__claude_ai_Linear__list_teams,mcp__claude_ai_Linear__search_issues" \
  --model "$AGENT_MODEL" \
  "$(cat "$PROMPT_FILE")" 2>/dev/null | node /Volumes/ex-ssd/workspace/mtbox/scripts/claude-stream.js | tee -a "$LOG_FILE"
