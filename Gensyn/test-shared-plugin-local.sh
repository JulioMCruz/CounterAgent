#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-gensyn-shared-plugin-logs"
mkdir -p "$LOG_DIR"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

start_plugin() {
  local name="$1"
  shift
  echo "starting $name"
  (
    cd "$PLUGIN_DIR"
    env "$@" npm run dev >"$LOG_DIR/$name.log" 2>&1
  ) &
  pids+=("$!")
}

wait_for() {
  local name="$1"
  local url="$2"
  for _ in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name ready"
      return 0
    fi
    sleep 1
  done
  echo "$name failed. Log:" >&2
  cat "$LOG_DIR/$name.log" >&2 || true
  exit 1
}

post_json() {
  local url="$1"
  local peer_id="$2"
  local file="$3"
  curl -fsS -X POST "$url/send" \
    -H 'content-type: application/json' \
    -H "X-Destination-Peer-Id: $peer_id" \
    --data-binary "@$file"
}

A0_URL=http://127.0.0.1:8890
A2_URL=http://127.0.0.1:8892
A3_URL=http://127.0.0.1:8893
A0_PEER=local-peer-a0
A2_PEER=local-peer-a2
A3_PEER=local-peer-a3

COMMON_ENV=(
  AXL_MODE=local
  AXL_PEER_A0=$A0_PEER
  AXL_PEER_A2=$A2_PEER
  AXL_PEER_A3=$A3_PEER
  AXL_LOCAL_A0_URL=$A0_URL
  AXL_LOCAL_A2_URL=$A2_URL
  AXL_LOCAL_A3_URL=$A3_URL
)

start_plugin a0 PORT=8890 AXL_AGENT_ID=A0-Orchestrator AXL_AGENT_ROLE=A0 "${COMMON_ENV[@]}"
start_plugin a2 PORT=8892 AXL_AGENT_ID=A2-Decision AXL_AGENT_ROLE=A2 "${COMMON_ENV[@]}"
start_plugin a3 PORT=8893 AXL_AGENT_ID=A3-Uniswap-SwapExecution AXL_AGENT_ROLE=A3 "${COMMON_ENV[@]}"

wait_for A0 "$A0_URL/healthz"
wait_for A2 "$A2_URL/healthz"
wait_for A3 "$A3_URL/healthz"

TMP_DIR="${TMPDIR:-/tmp}/counteragent-gensyn-shared-plugin"
mkdir -p "$TMP_DIR"
WORKFLOW_ID="shared-plugin-local-$(date +%s)"
NONCE_A2="nonce-a2-$RANDOM-$RANDOM"
NONCE_A3="nonce-a3-$RANDOM-$RANDOM"

cat > "$TMP_DIR/a0-to-a2.json" <<JSON
{
  "workflowId": "$WORKFLOW_ID",
  "messageId": "$WORKFLOW_ID-a2",
  "sequence": 1,
  "fromAgent": "A0-Orchestrator",
  "toAgent": "A2-Decision",
  "messageType": "shared-plugin-a2-ping",
  "payload": { "nonce": "$NONCE_A2" }
}
JSON

cat > "$TMP_DIR/a0-to-a3.json" <<JSON
{
  "workflowId": "$WORKFLOW_ID",
  "messageId": "$WORKFLOW_ID-a3",
  "sequence": 2,
  "fromAgent": "A0-Orchestrator",
  "toAgent": "A3-Uniswap-SwapExecution",
  "messageType": "shared-plugin-a3-ping",
  "payload": { "nonce": "$NONCE_A3" }
}
JSON

echo "sending A0 plugin -> A2 plugin"
post_json "$A0_URL" "$A2_PEER" "$TMP_DIR/a0-to-a2.json" >/dev/null
curl -fsS "$A2_URL/recv?limit=10" | python3 -c 'import json, sys; workflow_id, nonce = sys.argv[1:]; data = json.load(sys.stdin); assert any(msg.get("workflowId") == workflow_id and (msg.get("payload") or {}).get("nonce") == nonce for msg in data.get("messages", [])), "A2 did not receive message"; print("A2 received message")' "$WORKFLOW_ID" "$NONCE_A2"

echo "sending A0 plugin -> A3 plugin"
post_json "$A0_URL" "$A3_PEER" "$TMP_DIR/a0-to-a3.json" >/dev/null
curl -fsS "$A3_URL/recv?limit=10" | python3 -c 'import json, sys; workflow_id, nonce = sys.argv[1:]; data = json.load(sys.stdin); assert any(msg.get("workflowId") == workflow_id and (msg.get("payload") or {}).get("nonce") == nonce for msg in data.get("messages", [])), "A3 did not receive message"; print("A3 received message")' "$WORKFLOW_ID" "$NONCE_A3"

echo "shared Gensyn transport plugin local test passed: $WORKFLOW_ID"
