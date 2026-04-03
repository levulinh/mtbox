#!/bin/bash
set -e

PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/programmer.log"

echo "=== Programmer Agent Run: $(date) ===" >> "$LOG_FILE"

PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
HOME="/Users/lelinh" \
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
