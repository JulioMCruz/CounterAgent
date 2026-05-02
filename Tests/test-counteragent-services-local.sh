#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-services-local-logs"
RUN_ID="counteragent-services-$(date +%s)"
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
  for _ in {1..80}; do
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

A0_AGENT=http://127.0.0.1:18887
A1_AGENT=http://127.0.0.1:18888
A2_AGENT=http://127.0.0.1:18890
A3_AGENT=http://127.0.0.1:18891
A4_AGENT=http://127.0.0.1:18889
TG_PLUGIN=http://127.0.0.1:18894

A0_AXL=http://127.0.0.1:18900
A1_AXL=http://127.0.0.1:18901
A2_AXL=http://127.0.0.1:18902
A3_AXL=http://127.0.0.1:18903
A4_AXL=http://127.0.0.1:18904
A0_PEER=local-peer-a0
A1_PEER=local-peer-a1
A2_PEER=local-peer-a2
A3_PEER=local-peer-a3
A4_PEER=local-peer-a4

TMP_DIR="${TMPDIR:-/tmp}/counteragent-services-local"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/reports"

start_service a1-agent "$ROOT_DIR/Agents/A1-Monitor/Plugin-ENS-MerchantConfig" PORT=18888 ENS_PARENT_NAME=counteragents.eth
start_service a2-agent "$ROOT_DIR/Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring" PORT=18890
start_service a3-agent "$ROOT_DIR/Agents/A3-Execution/Plugin-Uniswap-SwapExecution" PORT=18891 EXECUTION_MODE=dry-run UNISWAP_QUOTE_MODE=fallback
start_service telegram-alerts "$ROOT_DIR/Agents/A4-Reporting/Plugin-Telegram-Alerts" PORT=18894 TELEGRAM_ALERTS_ENABLED=false
start_service a4-agent "$ROOT_DIR/Agents/A4-Reporting/Plugin-CounterAgent" PORT=18889 REPORT_STORAGE_MODE=local REPORT_STORAGE_DIR="$TMP_DIR/reports" TELEGRAM_ALERTS_URL="$TG_PLUGIN" TELEGRAM_ALERTS_ENABLED=true

COMMON_AXL_ENV=(
  AXL_MODE=local
  AXL_PEER_A0=$A0_PEER
  AXL_PEER_A1=$A1_PEER
  AXL_PEER_A2=$A2_PEER
  AXL_PEER_A3=$A3_PEER
  AXL_PEER_A4=$A4_PEER
  AXL_LOCAL_A0_URL=$A0_AXL
  AXL_LOCAL_A1_URL=$A1_AXL
  AXL_LOCAL_A2_URL=$A2_AXL
  AXL_LOCAL_A3_URL=$A3_AXL
  AXL_LOCAL_A4_URL=$A4_AXL
  AXL_SERVICE_A1_URL=$A1_AGENT/mcp
  AXL_SERVICE_A2_URL=$A2_AGENT/mcp
  AXL_SERVICE_A3_URL=$A3_AGENT/mcp
  AXL_SERVICE_A4_URL=$A4_AGENT/mcp
)

start_service a0-axl "$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport" PORT=18900 AXL_AGENT_ID=A0-Orchestrator AXL_AGENT_ROLE=A0 "${COMMON_AXL_ENV[@]}"
start_service a1-axl "$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport" PORT=18901 AXL_AGENT_ID=A1-Monitor AXL_AGENT_ROLE=A1 "${COMMON_AXL_ENV[@]}"
start_service a2-axl "$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport" PORT=18902 AXL_AGENT_ID=A2-Decision AXL_AGENT_ROLE=A2 "${COMMON_AXL_ENV[@]}"
start_service a3-axl "$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport" PORT=18903 AXL_AGENT_ID=A3-Uniswap-SwapExecution AXL_AGENT_ROLE=A3 "${COMMON_AXL_ENV[@]}"
start_service a4-axl "$ROOT_DIR/Gensyn/Plugin-Gensyn-AXL-Transport" PORT=18904 AXL_AGENT_ID=A4-Reporting AXL_AGENT_ROLE=A4 "${COMMON_AXL_ENV[@]}"

start_service a0-agent "$ROOT_DIR/Agents/A0-Orchestrator/Plugin-CounterAgent" \
  PORT=18887 \
  CORS_ORIGIN=http://localhost:3000 \
  DEFAULT_CHAIN_ID=84532 \
  BASE_RPC_URL=https://sepolia.base.org \
  MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D \
  MONITOR_AGENT_URL= \
  DECISION_AGENT_URL=$A2_AGENT \
  EXECUTION_AGENT_URL=$A3_AGENT \
  REPORTING_AGENT_URL=$A4_AGENT \
  GENSYN_AXL_MESSAGING_URL= \
  GENSYN_AXL_MODE=transport \
  GENSYN_AXL_NODE_URL=$A0_AXL \
  GENSYN_AXL_PEER_A1=$A1_PEER \
  GENSYN_AXL_PEER_A2=$A2_PEER \
  GENSYN_AXL_PEER_A3=$A3_PEER \
  GENSYN_AXL_PEER_A4=$A4_PEER \
  GENSYN_AXL_SERVICE_A1=counteragent-monitor \
  GENSYN_AXL_SERVICE_A2=counteragent-decision \
  GENSYN_AXL_SERVICE_A3=counteragent-execution \
  GENSYN_AXL_SERVICE_A4=counteragent-reporting \
  GENSYN_AXL_FALLBACK_HTTP=false \
  GENSYN_AXL_TRACE_LIMIT=200 \
  ENS_PARENT_NAME=counteragents.eth

for item in \
  "A1-agent $A1_AGENT/healthz" \
  "A2-agent $A2_AGENT/healthz" \
  "A3-agent $A3_AGENT/healthz" \
  "Telegram-alerts $TG_PLUGIN/healthz" \
  "A4-agent $A4_AGENT/healthz" \
  "A0-AXL $A0_AXL/healthz" \
  "A1-AXL $A1_AXL/healthz" \
  "A2-AXL $A2_AXL/healthz" \
  "A3-AXL $A3_AXL/healthz" \
  "A4-AXL $A4_AXL/healthz" \
  "A0-agent $A0_AGENT/healthz"; do
  wait_for ${item%% *} ${item#* }
done

echo "testing A1 ENS profile record generation"
cat > "$TMP_DIR/ens-profile.json" <<'JSON'
{"website":"https://counteragents.cc","description":"CounterAgent merchant profile test","socials":{"telegram":"@CounterAgents_Bot","twitter":"@counteragents"},"subnames":["monitor.counteragents.eth","reporting.counteragents.eth"]}
JSON
post_json "$A1_AGENT/ens/profile/records" "$TMP_DIR/ens-profile.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; records=payload.get("records", {}); assert records.get("org.telegram") == "CounterAgents_Bot", records; assert "counteragent.subnames" in records, records; print("A1 ENS records ok")'

echo "testing A1 MCP over AXL"
cat > "$TMP_DIR/mcp-a1-list.json" <<'JSON'
{"jsonrpc":"2.0","id":"a1-tools","method":"tools/list","params":{}}
JSON
post_json "$A0_AXL/mcp/$A1_PEER/counteragent-monitor" "$TMP_DIR/mcp-a1-list.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert "result" in payload, payload; names=[tool.get("name") for tool in payload["result"].get("tools", [])]; assert "lookup_merchant_config" in names, names; print("A1 MCP over AXL ok")'

echo "testing A3 Uniswap fallback quote"
cat > "$TMP_DIR/quote.json" <<JSON
{"workflowId":"$RUN_ID-quote","merchantWallet":"0x0000000000000000000000000000000000000001","fromToken":"EURC","toToken":"USDC","amount":"100.00","slippageBps":50,"dryRunRate":1.02,"baselineRate":1}
JSON
post_json "$A3_AGENT/execution/quote" "$TMP_DIR/quote.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; quote=payload.get("quote", {}); assert quote.get("rate") == 1.02, quote; print("A3 quote ok")'

echo "testing Telegram plugin disabled path"
cat > "$TMP_DIR/telegram.json" <<'JSON'
{"chatId":"12345","kind":"hold","merchantEns":"demo.counteragents.eth","summary":"local service test"}
JSON
post_json "$TG_PLUGIN/telegram/send" "$TMP_DIR/telegram.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True and payload.get("skipped") is True, payload; assert payload.get("reason") == "telegram_alerts_disabled", payload; print("Telegram plugin ok")'

echo "testing full A0 workflow through AXL to A2/A3/A4"
cat > "$TMP_DIR/workflow.json" <<JSON
{"walletAddress":"0x0000000000000000000000000000000000000001","merchantEns":"demo.counteragents.eth","fromToken":"EURC","toToken":"USDC","amount":"100.00","fxThresholdBps":10,"riskTolerance":"moderate","slippageBps":50,"dryRunRate":1.02,"baselineRate":1,"idempotencyKey":"$RUN_ID-workflow"}
JSON
post_json "$A0_AGENT/workflow/evaluate" "$TMP_DIR/workflow.json" \
  | tee "$TMP_DIR/workflow-response.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; assert payload.get("decision",{}).get("decision",{}).get("action") == "CONVERT", payload; assert payload.get("execution",{}).get("status") in {"dry-run","fallback-dry-run"}, payload; report=payload.get("report") or {}; assert report.get("ok") is True, report; assert (report.get("telegramAlert") or {}).get("reason") in {"telegram_alerts_disabled","telegram_chat_id_missing","telegram_alerts_not_configured"}, report; print("A0 workflow ok")'

echo "checking AXL traces for A1/A2/A3/A4"
curl -fsS "$A0_AGENT/axl/status" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("mode") == "transport", payload; assert payload.get("fallbackToHttp") is False, payload; messages=payload.get("recentMessages", []); missing=[agent for agent in ["A1-Monitor","A2-Decision","A3-Uniswap-SwapExecution","A4-Reporting"] if not any(m.get("toAgent") == agent and (m.get("axl") or {}).get("ok") for m in messages)]; assert not missing, (missing, messages); print("A0 AXL trace ok")'

for role_url in "A1 $A1_AXL" "A2 $A2_AXL" "A3 $A3_AXL" "A4 $A4_AXL"; do
  role=${role_url%% *}
  url=${role_url#* }
  curl -fsS "$url/recv?limit=20&drain=false" \
    | python3 -c 'import json, sys; workflow_id=sys.argv[1]; role=sys.argv[2]; payload=json.load(sys.stdin); assert any(m.get("workflowId") == workflow_id for m in payload.get("messages", [])), (role, payload); print(f"{role} AXL inbox ok")' "$RUN_ID-workflow" "$role"
done

echo "CounterAgent local services workflow test passed: $RUN_ID"
echo "Logs: $LOG_DIR"
