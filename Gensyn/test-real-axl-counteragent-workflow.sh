#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-real-axl-workflow-logs"
mkdir -p "$LOG_DIR"

fail() {
  echo "error: $*" >&2
  exit 1
}

require_var() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" && "$value" != "<A2_PEER_ID>" && "$value" != "<A3_PEER_ID>" ]] || fail "$name is required"
}

trim_slash() {
  printf '%s' "${1%/}"
}

is_https_url() {
  [[ "$1" =~ ^https:// ]]
}

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

start_service() {
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
  echo "$name failed to start. Log:" >&2
  cat "$LOG_DIR/$name.log" >&2 || true
  return 1
}

post_json() {
  local url="$1"
  local file="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' --data-binary "@$file"
}

require_var AXL_A0_URL
require_var AXL_PEER_A1
require_var AXL_PEER_A2
require_var AXL_PEER_A3
require_var AXL_PEER_A4

AXL_A0_URL="$(trim_slash "$AXL_A0_URL")"
REQUIRE_HTTPS_AXL="${REQUIRE_HTTPS_AXL:-true}"

if [[ "$REQUIRE_HTTPS_AXL" == "true" ]]; then
  is_https_url "$AXL_A0_URL" || fail "AXL_A0_URL must be HTTPS for real AXL tests"
fi
A0_PORT="${A0_PORT:-8787}"
A1_PORT="${A1_PORT:-8788}"
A2_PORT="${A2_PORT:-8790}"
A3_PORT="${A3_PORT:-8791}"
A4_PORT="${A4_PORT:-8789}"
GENSYN_AXL_SERVICE_A1="${GENSYN_AXL_SERVICE_A1:-counteragent-monitor}"
GENSYN_AXL_SERVICE_A2="${GENSYN_AXL_SERVICE_A2:-counteragent-decision}"
GENSYN_AXL_SERVICE_A3="${GENSYN_AXL_SERVICE_A3:-counteragent-execution}"
GENSYN_AXL_SERVICE_A4="${GENSYN_AXL_SERVICE_A4:-counteragent-reporting}"

echo "checking AXL node API"
curl -fsS "$AXL_A0_URL/topology" | python3 -m json.tool >/dev/null

cat > "$LOG_DIR/mcp-probe.json" <<JSON
{
  "jsonrpc": "2.0",
  "id": "probe",
  "method": "tools/list",
  "params": {}
}
JSON

echo "checking AXL MCP route to A1"
post_json "$AXL_A0_URL/mcp/$AXL_PEER_A1/$GENSYN_AXL_SERVICE_A1" "$LOG_DIR/mcp-probe.json" | python3 -m json.tool >/dev/null

echo "checking AXL MCP route to A2"
post_json "$AXL_A0_URL/mcp/$AXL_PEER_A2/$GENSYN_AXL_SERVICE_A2" "$LOG_DIR/mcp-probe.json" | python3 -m json.tool >/dev/null

echo "checking AXL MCP route to A3"
post_json "$AXL_A0_URL/mcp/$AXL_PEER_A3/$GENSYN_AXL_SERVICE_A3" "$LOG_DIR/mcp-probe.json" | python3 -m json.tool >/dev/null

echo "checking AXL MCP route to A4"
post_json "$AXL_A0_URL/mcp/$AXL_PEER_A4/$GENSYN_AXL_SERVICE_A4" "$LOG_DIR/mcp-probe.json" | python3 -m json.tool >/dev/null

start_service a2 "$ROOT_DIR/Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring" \
  PORT="$A2_PORT"

start_service a3 "$ROOT_DIR/Agents/A3-Execution/Plugin-Uniswap-SwapExecution" \
  PORT="$A3_PORT" \
  EXECUTION_MODE=dry-run \
  UNISWAP_QUOTE_MODE=fallback

start_service a0 "$ROOT_DIR/Agents/A0-Orchestrator/Plugin-CounterAgent" \
  PORT="$A0_PORT" \
  CORS_ORIGIN=http://localhost:3000 \
  DEFAULT_CHAIN_ID=84532 \
  BASE_RPC_URL=https://sepolia.base.org \
  MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D \
  MONITOR_AGENT_URL=http://127.0.0.1:"$A1_PORT" \
  REPORTING_AGENT_URL=http://127.0.0.1:"$A4_PORT" \
  DECISION_AGENT_URL=http://127.0.0.1:"$A2_PORT" \
  EXECUTION_AGENT_URL=http://127.0.0.1:"$A3_PORT" \
  GENSYN_AXL_MESSAGING_URL= \
  GENSYN_AXL_MODE=transport \
  GENSYN_AXL_NODE_URL="$AXL_A0_URL" \
  GENSYN_AXL_PEER_A1="$AXL_PEER_A1" \
  GENSYN_AXL_PEER_A2="$AXL_PEER_A2" \
  GENSYN_AXL_PEER_A3="$AXL_PEER_A3" \
  GENSYN_AXL_PEER_A4="$AXL_PEER_A4" \
  GENSYN_AXL_SERVICE_A1="$GENSYN_AXL_SERVICE_A1" \
  GENSYN_AXL_SERVICE_A2="$GENSYN_AXL_SERVICE_A2" \
  GENSYN_AXL_SERVICE_A3="$GENSYN_AXL_SERVICE_A3" \
  GENSYN_AXL_SERVICE_A4="$GENSYN_AXL_SERVICE_A4" \
  GENSYN_AXL_FALLBACK_HTTP=false \
  GENSYN_AXL_TRACE_LIMIT=100 \
  ENS_PARENT_NAME=counteragents.eth

wait_for A2 "http://127.0.0.1:$A2_PORT/healthz"
wait_for A3 "http://127.0.0.1:$A3_PORT/healthz"
wait_for A0 "http://127.0.0.1:$A0_PORT/healthz"

WORKFLOW_ID="real-axl-workflow-$(date +%s)"
cat > "$LOG_DIR/workflow.json" <<JSON
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

echo "running CounterAgent workflow through real AXL MCP transport"
post_json "http://127.0.0.1:$A0_PORT/workflow/evaluate" "$LOG_DIR/workflow.json" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("ok") is True; assert data.get("decision",{}).get("decision",{}).get("action") == "CONVERT"; assert data.get("execution",{}).get("status") in {"dry-run","fallback-dry-run"}; assert data.get("reportWarning") in {None, "report_publish_failed"}; print("workflow ok")'

echo "checking A0 AXL status"
curl -fsS "http://127.0.0.1:$A0_PORT/axl/status" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("mode") == "transport"; assert data.get("fallbackToHttp") is False; peers=data.get("peers",{}); assert all(peers.get(role) is True for role in ("A1","A2","A3","A4")); messages=data.get("recentMessages",[]); targets={m.get("toAgent") for m in messages}; assert "A1-Monitor" in targets and "A2-Decision" in targets and "A3-Uniswap-SwapExecution" in targets and "A4-Reporting" in targets; print("axl status ok")'

echo "CounterAgent real AXL workflow test passed: $WORKFLOW_ID"
