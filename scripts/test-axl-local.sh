#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-axl-local-logs"
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

start_service a2 "$ROOT_DIR/Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring" \
  PORT=8790

start_service a3 "$ROOT_DIR/Agents/A3-Execution/Plugin-Uniswap-SwapExecution" \
  PORT=8791 \
  EXECUTION_MODE=dry-run \
  UNISWAP_QUOTE_MODE=fallback

start_service axl "$ROOT_DIR/Agents/A0-Orchestrator/Plugin-Gensyn-AXL-AgentMessaging" \
  PORT=8792 \
  GENSYN_AXL_MODE=adapter \
  GENSYN_AXL_AGENT_ID=counteragent-a0 \
  GENSYN_AXL_SERVICE_A2_URL=http://127.0.0.1:8790/mcp \
  GENSYN_AXL_SERVICE_A3_URL=http://127.0.0.1:8791/mcp

start_service a0 "$ROOT_DIR/Agents/A0-Orchestrator/Plugin-CounterAgent" \
  PORT=8787 \
  CORS_ORIGIN=http://localhost:3000 \
  DEFAULT_CHAIN_ID=84532 \
  BASE_RPC_URL=https://sepolia.base.org \
  MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D \
  MONITOR_AGENT_URL= \
  REPORTING_AGENT_URL= \
  DECISION_AGENT_URL=http://127.0.0.1:8790 \
  EXECUTION_AGENT_URL=http://127.0.0.1:8791 \
  GENSYN_AXL_MESSAGING_URL=http://127.0.0.1:8792 \
  GENSYN_AXL_MODE=transport \
  GENSYN_AXL_NODE_URL=http://127.0.0.1:8792 \
  GENSYN_AXL_PEER_A2=local-a2 \
  GENSYN_AXL_PEER_A3=local-a3 \
  GENSYN_AXL_SERVICE_A2=counteragent-decision \
  GENSYN_AXL_SERVICE_A3=counteragent-execution \
  GENSYN_AXL_FALLBACK_HTTP=false \
  GENSYN_AXL_TRACE_LIMIT=100 \
  ENS_PARENT_NAME=counteragents.eth

wait_for A2 http://127.0.0.1:8790/healthz
wait_for A3 http://127.0.0.1:8791/healthz
wait_for AXL http://127.0.0.1:8792/healthz
wait_for A0 http://127.0.0.1:8787/healthz

echo "testing topology"
curl -fsS http://127.0.0.1:8792/topology | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("ok") is True; print(json.dumps(data))'

cat > "$LOG_DIR/send.json" <<'JSON'
{"workflowId":"local-test-axl","messageId":"msg-1","sequence":1,"fromAgent":"A0-Orchestrator","toAgent":"A2-Decision","messageType":"ping","createdAt":"2026-05-02T12:00:00.000Z","payload":{"ok":true}}
JSON

echo "testing send/recv"
post_json http://127.0.0.1:8792/send "$LOG_DIR/send.json" >/dev/null
curl -fsS 'http://127.0.0.1:8792/recv?limit=5' | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("messages"); print("recv ok")'

cat > "$LOG_DIR/mcp-decision.json" <<'JSON'
{
  "jsonrpc": "2.0",
  "id": "mcp-test",
  "method": "tools/call",
  "params": {
    "name": "evaluate_decision",
    "arguments": {
      "workflowId": "local-test-mcp",
      "merchantWallet": "0x0000000000000000000000000000000000000001",
      "fromToken": "EURC",
      "toToken": "USDC",
      "amount": "100.00",
      "fxThresholdBps": 10,
      "riskTolerance": "moderate",
      "quote": { "provider": "local-test", "rate": 1.02, "baselineRate": 1, "feeBps": 5, "priceImpactBps": 1 }
    }
  }
}
JSON

echo "testing MCP through AXL adapter"
post_json http://127.0.0.1:8792/mcp/local-a2/counteragent-decision "$LOG_DIR/mcp-decision.json" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert "result" in data; print("mcp ok")'

cat > "$LOG_DIR/workflow.json" <<'JSON'
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
  "idempotencyKey": "local-axl-workflow-script"
}
JSON

echo "testing full workflow through AXL transport"
post_json http://127.0.0.1:8787/workflow/evaluate "$LOG_DIR/workflow.json" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("ok") is True; assert data.get("decision",{}).get("decision",{}).get("action") == "CONVERT"; assert data.get("execution",{}).get("status") in {"dry-run","fallback-dry-run"}; print("workflow ok")'

echo "testing A0 AXL trace"
curl -fsS http://127.0.0.1:8787/axl/status \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("mode") == "transport"; assert data.get("fallbackToHttp") is False; assert any((m.get("axl") or {}).get("ok") for m in data.get("recentMessages", [])); print("axl trace ok")'

echo "AXL local communication test passed"
