#!/usr/bin/env bash
# Starts a cloudflared quick tunnel to the dashboard and registers/updates
# the Linear webhook so it always points to the current tunnel URL.
#
# Required env vars:
#   LINEAR_API_KEY          – Personal API key from Linear Settings → API
#   LINEAR_WEBHOOK_SECRET   – Shared secret for signing (you pick any random string)
#
# Optional:
#   DASHBOARD_PORT          – defaults to 4242

DASHBOARD_PORT="${DASHBOARD_PORT:-4242}"
WEBHOOK_ID_FILE="$HOME/.mtbox/linear-webhook-id"
TEAM_ID="86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"

mkdir -p "$HOME/.mtbox"

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo "[tunnel] ERROR: LINEAR_API_KEY is not set" >&2
  exit 1
fi
if [[ -z "${LINEAR_WEBHOOK_SECRET:-}" ]]; then
  echo "[tunnel] ERROR: LINEAR_WEBHOOK_SECRET is not set" >&2
  exit 1
fi

# ── Start cloudflared in background, capture stderr to a file ──
TUNNEL_LOG=$(mktemp /tmp/cloudflared-XXXX.log)
cloudflared tunnel --url "http://localhost:${DASHBOARD_PORT}" 2>"$TUNNEL_LOG" &
CF_PID=$!

cleanup() {
  echo "[tunnel] Shutting down cloudflared (PID $CF_PID)..."
  kill "$CF_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT

# Wait for cloudflared to print the tunnel URL (up to 30s)
echo "[tunnel] Waiting for tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  # Check cloudflared is still running
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "[tunnel] ERROR: cloudflared exited unexpectedly" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "[tunnel] ERROR: Could not get tunnel URL after 30s" >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

echo "[tunnel] Tunnel URL: $TUNNEL_URL"
WEBHOOK_URL="${TUNNEL_URL}/webhook/linear"

# ── Create or update the Linear webhook ──
EXISTING_ID=""
if [[ -f "$WEBHOOK_ID_FILE" ]]; then
  EXISTING_ID=$(cat "$WEBHOOK_ID_FILE" 2>/dev/null || true)
fi

if [[ -n "$EXISTING_ID" ]]; then
  echo "[tunnel] Updating existing webhook ${EXISTING_ID}..."
  RESULT=$(curl -s --max-time 10 -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation { webhookUpdate(id: \\\"${EXISTING_ID}\\\", input: { url: \\\"${WEBHOOK_URL}\\\", secret: \\\"${LINEAR_WEBHOOK_SECRET}\\\", enabled: true }) { success webhook { id url enabled } } }\"}" || true)

  if echo "$RESULT" | grep -q '"success":true'; then
    echo "[tunnel] Webhook updated: $WEBHOOK_URL"
  else
    echo "[tunnel] Update failed, creating new webhook instead..."
    EXISTING_ID=""
  fi
fi

if [[ -z "$EXISTING_ID" ]]; then
  echo "[tunnel] Creating new Linear webhook..."
  RESULT=$(curl -s --max-time 10 -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation { webhookCreate(input: { url: \\\"${WEBHOOK_URL}\\\", secret: \\\"${LINEAR_WEBHOOK_SECRET}\\\", resourceTypes: [\\\"Issue\\\"], teamId: \\\"${TEAM_ID}\\\" }) { success webhook { id url enabled } } }\"}" || true)

  NEW_ID=$(echo "$RESULT" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4 || true)
  if [[ -z "$NEW_ID" ]]; then
    echo "[tunnel] WARNING: Failed to create webhook (will retry on next restart)" >&2
    echo "[tunnel] Response: $RESULT" >&2
  else
    echo "$NEW_ID" > "$WEBHOOK_ID_FILE"
    echo "[tunnel] Webhook created (id: $NEW_ID): $WEBHOOK_URL"
  fi
fi

# ── Keep running until cloudflared exits ──
echo "[tunnel] Tunnel is live."
wait "$CF_PID"
