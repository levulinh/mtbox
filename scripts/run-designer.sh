#!/bin/bash
set -e

PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/designer.log"

echo "=== Designer Agent Run: $(date) ===" >> "$LOG_FILE"

NODE_PATH=/opt/homebrew/lib/node_modules \
PATH="/Volumes/ex-ssd/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
HOME="/Users/lelinh" \
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*,mcp__plugin_playwright_playwright__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
