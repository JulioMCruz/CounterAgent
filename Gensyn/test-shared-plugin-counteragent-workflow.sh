#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-gensyn-shared-workflow-logs"
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

start_cmd() {
  local name="$1"
  local dir="$2"
  shift 2
  echo "starting $name"
  (
    cd "$dir"
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
  local file="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' --data-binary "@$file"
}

A0_AGENT=http://127.0.0.1:8787
A2_AGENT=http://127.0.0.1:8790
A3_AGENT=http://127.0.0.1:8791
A0_PLUGIN=http://127.0.0.1:8890
A2_PLUGIN=http://127.0.0.1:8892
A3_PLUGIN=http://127.0.0.1:8893
A0_PEER=local-peer-a0
A2_PEER=local-peer-a2
A3_PEER=local-peer-a3

COMMON_PLUGIN_ENV=(
  AXL_MODE=local
  AXL_PEER_A0=$A0_PEER
  AXL_PEER_A2=$A2_PEER
  AXL_PEER_A3=$A3_PEER
  AXL_LOCAL_A0_URL=$A0_PLUGIN
  AXL_LOCAL_A2_URL=$A2_PLUGIN
  AXL_LOCAL_A3_URL=$A3_PLUGIN
  AXL_SERVICE_A2_URL=$A2_AGENT/mcp
  AXL_SERVICE_A3_URL=$A3_AGENT/mcp
)

start_cmd a2-agent "$ROOT_DIR/Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring" PORT=8790
start_cmd a3-agent "$ROOT_DIR/Agents/A3-Execution/Plugin-Uniswap-SwapExecution" PORT=8791 EXECUTION_MODE=dry-run UNISWAP_QUOTE_MODE=fallback

start_cmd a0-transport "$PLUGIN_DIR" PORT=8890 AXL_AGENT_ID=A0-Orchestrator AXL_AGENT_ROLE=A0 "${COMMON_PLUGIN_ENV[@]}"
start_cmd a2-transport "$PLUGIN_DIR" PORT=8892 AXL_AGENT_ID=A2-Decision AXL_AGENT_ROLE=A2 "${COMMON_PLUGIN_ENV[@]}"
start_cmd a3-transport "$PLUGIN_DIR" PORT=8893 AXL_AGENT_ID=A3-Uniswap-SwapExecution AXL_AGENT_ROLE=A3 "${COMMON_PLUGIN_ENV[@]}"

start_cmd a0-agent "$ROOT_DIR/Agents/A0-Orchestrator/Plugin-CounterAgent" \
  PORT=8787 \
  CORS_ORIGIN=http://localhost:3000 \
  DEFAULT_CHAIN_ID=84532 \
  BASE_RPC_URL=https://sepolia.base.org \
  MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D \
  MONITOR_AGENT_URL= \
  REPORTING_AGENT_URL= \
  DECISION_AGENT_URL=$A2_AGENT \
  EXECUTION_AGENT_URL=$A3_AGENT \
  GENSYN_AXL_MESSAGING_URL= \
  GENSYN_AXL_MODE=transport \
  GENSYN_AXL_NODE_URL=$A0_PLUGIN \
  GENSYN_AXL_PEER_A2=$A2_PEER \
  GENSYN_AXL_PEER_A3=$A3_PEER \
  GENSYN_AXL_SERVICE_A2=counteragent-decision \
  GENSYN_AXL_SERVICE_A3=counteragent-execution \
  GENSYN_AXL_FALLBACK_HTTP=false \
  GENSYN_AXL_TRACE_LIMIT=100 \
  ENS_PARENT_NAME=counteragents.eth

wait_for A2-agent "$A2_AGENT/healthz"
wait_for A3-agent "$A3_AGENT/healthz"
wait_for A0-transport "$A0_PLUGIN/healthz"
wait_for A2-transport "$A2_PLUGIN/healthz"
wait_for A3-transport "$A3_PLUGIN/healthz"
wait_for A0-agent "$A0_AGENT/healthz"

TMP_DIR="${TMPDIR:-/tmp}/counteragent-gensyn-shared-workflow"
mkdir -p "$TMP_DIR"
WORKFLOW_ID="shared-plugin-workflow-$(date +%s)"
cat > "$TMP_DIR/workflow.json" <<JSON
{
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "fromToken": "EURC",
  "toToken": "USDC",
  "amount": "100.00",
  "fxThresholdBps": 10,
  "riskTolerance": "moderate",
  "slippageBps": 50,
  "dryRunRate": 1.02,
  "baselineRate": 1,
  "idempotencyKey": "$WORKFLOW_ID"
}
JSON

echo "running CounterAgent workflow through shared Gensyn transport plugin"
post_json "$A0_AGENT/workflow/evaluate" "$TMP_DIR/workflow.json" \
  | python3 -c 'import json, sys; data=json.load(sys.stdin); assert data.get("ok") is True; assert data.get("decision",{}).get("decision",{}).get("action") == "CONVERT"; assert data.get("execution",{}).get("status") in {"dry-run","fallback-dry-run"}; print("workflow ok")'

echo "checking A0 transport sent messages"
curl -fsS "$A0_PLUGIN/sent?limit=20" \
  | python3 -c 'import json, sys; data=json.load(sys.stdin); messages=data.get("messages", []); assert any(m.get("toAgent") == "A2-Decision" for m in messages); assert any(m.get("toAgent") == "A3-Uniswap-SwapExecution" for m in messages); print("transport sent trace ok")'

echo "checking A2/A3 transport inboxes"
curl -fsS "$A2_PLUGIN/recv?limit=20&drain=false" \
  | python3 -c 'import json, sys; data=json.load(sys.stdin); assert any(m.get("workflowId") == sys.argv[1] for m in data.get("messages", [])); print("A2 transport inbox ok")' "$WORKFLOW_ID"
curl -fsS "$A3_PLUGIN/recv?limit=20&drain=false" \
  | python3 -c 'import json, sys; data=json.load(sys.stdin); assert any(m.get("workflowId") == sys.argv[1] for m in data.get("messages", [])); print("A3 transport inbox ok")' "$WORKFLOW_ID"

echo "shared plugin CounterAgent workflow test passed: $WORKFLOW_ID"
