#!/bin/bash
AGENT="qa"
PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/qa-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}.log"
LOCK_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.lock"
STATUS_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.status"
MENTION_FILE="/Volumes/ex-ssd/workspace/mtbox/status/${AGENT}.mention"
PRECHECK_SCRIPT="/Volumes/ex-ssd/workspace/mtbox/scripts/linear-precheck.sh"

SECRETS_FILE="/Volumes/ex-ssd/workspace/mtbox/scripts/secrets.sh"
[ -f "$SECRETS_FILE" ] && source "$SECRETS_FILE"
export LINEAR_API_KEY="${LINEAR_API_KEY_QA:-$LINEAR_API_KEY}"
export ANDROID_HOME=/Volumes/ex-ssd/android-sdk
export ANDROID_AVD_HOME=/Volumes/ex-ssd/android-avd
export PATH="/Volumes/ex-ssd/flutter/bin:/Volumes/ex-ssd/android-sdk/cmdline-tools/latest/bin:/Volumes/ex-ssd/android-sdk/platform-tools:/Volumes/ex-ssd/android-sdk/emulator:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/lelinh"

# Skip if already running — dashboard queue handles retry after rest
if [ -f "$LOCK_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(echo "$AGENT" | tr '[:lower:]' '[:upper:]') agent is busy (PID $(cat "$LOCK_FILE")), skipping." | tee -a "$LOG_FILE"
    exit 0
fi

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

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === QA Agent starting ===" | tee -a "$LOG_FILE"

/Users/lelinh/.local/bin/claude \
  --print \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__list_comments,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_projects,mcp__claude_ai_Linear__list_teams,mcp__claude_ai_Linear__search_issues" \
  --model haiku \
  "$(cat "$PROMPT_FILE")" 2>/dev/null | node /Volumes/ex-ssd/workspace/mtbox/scripts/claude-stream.js | tee -a "$LOG_FILE"
