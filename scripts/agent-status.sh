#!/bin/bash
# Show status of all MTBox agents

STATUS_DIR="/Volumes/ex-ssd/workspace/mtbox/status"
LOG_DIR="/Volumes/ex-ssd/workspace/mtbox/logs"

echo "MTBox Agent Status — $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================="

for agent in pm cto designer programmer qa; do
    STATUS_FILE="$STATUS_DIR/${agent}.status"
    LOCK_FILE="$STATUS_DIR/${agent}.lock"
    LOG_FILE="$LOG_DIR/${agent}.log"

    if [ -f "$LOCK_FILE" ]; then
        PID=$(cat "$LOCK_FILE")
        STATUS="🔄 BUSY (PID $PID)"
    elif [ -f "$STATUS_FILE" ]; then
        RAW=$(cat "$STATUS_FILE")
        case "$RAW" in
            idle)  STATUS="✅ idle" ;;
            error) STATUS="❌ last run had error" ;;
            *)     STATUS="❓ $RAW" ;;
        esac
    else
        STATUS="⚪ never run"
    fi

    LAST_RUN=""
    if [ -f "$LOG_FILE" ]; then
        LAST_RUN=$(grep "=== .* starting ===" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oE '\[.*\]' | tr -d '[]')
    fi

    printf "  %-12s %s" "$(echo "$agent" | tr '[:lower:]' '[:upper:]')" "$STATUS"
    [ -n "$LAST_RUN" ] && printf "  (last run: %s)" "$LAST_RUN"
    echo ""
done

echo ""
echo "launchd jobs:"
launchctl list | grep mtbox | awk '{printf "  %s  PID=%s  exit=%s\n", $3, $1, $2}'
