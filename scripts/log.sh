#!/bin/bash
# Emit a timestamped narration line to an agent's log.
#
# Usage:
#   bash /Volumes/ex-ssd/workspace/mtbox/scripts/log.sh <agent> "message"
#
# Writes: [YYYY-MM-DD HH:MM:SS] 💬 message
# Both to the log file AND stdout (so Claude sees the confirmation).

AGENT="$1"
MESSAGE="$2"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/${AGENT}.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 💬 ${MESSAGE}" | tee -a "$LOG_FILE"
