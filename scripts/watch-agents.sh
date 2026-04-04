#!/bin/bash
# Watch all agent logs in real-time with colored prefixes
# Usage: bash watch-agents.sh [agent]
#   No args: watch all 4 agents
#   Arg: watch a single agent (pm, designer, programmer, qa)

LOG_DIR="/Volumes/ex-ssd/workspace/mtbox/logs"

# Colors
PM_COLOR='\033[0;34m'        # Blue
CTO_COLOR='\033[0;36m'       # Cyan
DESIGNER_COLOR='\033[0;35m'  # Magenta
PROG_COLOR='\033[0;32m'      # Green
QA_COLOR='\033[0;33m'        # Yellow
RESET='\033[0m'
DIM='\033[2m'

cleanup() {
    kill $(jobs -p) 2>/dev/null
    echo -e "\n${DIM}Stopped watching.${RESET}"
    exit 0
}
trap cleanup SIGINT SIGTERM

watch_agent() {
    local name="$1"
    local color="$2"
    local log="$LOG_DIR/${name}.log"
    local label=$(echo "$name" | tr '[:lower:]' '[:upper:]')

    # Create log file if it doesn't exist
    touch "$log"

    tail -n 20 -f "$log" | while IFS= read -r line; do
        printf "${color}[${label}]${RESET} %s\n" "$line"
    done
}

AGENT="${1:-}"

if [ -n "$AGENT" ]; then
    # Single agent
    case "$AGENT" in
        pm)         watch_agent "pm" "$PM_COLOR" ;;
        cto)        watch_agent "cto" "$CTO_COLOR" ;;
        designer)   watch_agent "designer" "$DESIGNER_COLOR" ;;
        programmer) watch_agent "programmer" "$PROG_COLOR" ;;
        qa)         watch_agent "qa" "$QA_COLOR" ;;
        *)
            echo "Unknown agent: $AGENT"
            echo "Usage: $0 [pm|cto|designer|programmer|qa]"
            exit 1
            ;;
    esac
else
    # All agents
    echo -e "${DIM}Watching all agents... (Ctrl+C to stop)${RESET}"
    echo -e "${PM_COLOR}[PM]${RESET} ${CTO_COLOR}[CTO]${RESET} ${DESIGNER_COLOR}[DESIGNER]${RESET} ${PROG_COLOR}[PROGRAMMER]${RESET} ${QA_COLOR}[QA]${RESET}"
    echo "---"

    watch_agent "pm" "$PM_COLOR" &
    watch_agent "cto" "$CTO_COLOR" &
    watch_agent "designer" "$DESIGNER_COLOR" &
    watch_agent "programmer" "$PROG_COLOR" &
    watch_agent "qa" "$QA_COLOR" &

    wait
fi
