#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/counteragent-ens-local-logs"
TMP_DIR="${TMPDIR:-/tmp}/counteragent-ens-local"
mkdir -p "$LOG_DIR" "$TMP_DIR"

pid=""
cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  cd "$ROOT_DIR/Agents/A1-Monitor/Plugin-ENS-MerchantConfig"
  env PORT=18888 ENS_PARENT_NAME=counteragents.eth npm run dev >"$LOG_DIR/a1-ens.log" 2>&1
) &
pid="$!"

for _ in {1..60}; do
  if curl -fsS http://127.0.0.1:18888/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:18888/healthz >/dev/null

cat > "$TMP_DIR/ens-profile.json" <<'JSON'
{
  "website": "https://counteragents.cc",
  "description": "CounterAgent merchant profile test",
  "socials": {
    "telegram": "@CounterAgents_Bot",
    "twitter": "@counteragents"
  },
  "subnames": [
    "orchestrator.counteragents.eth",
    "monitor.counteragents.eth",
    "decision.counteragents.eth",
    "execution.counteragents.eth",
    "reporting.counteragents.eth"
  ]
}
JSON

curl -fsS -X POST http://127.0.0.1:18888/ens/profile/records \
  -H 'content-type: application/json' \
  --data-binary "@$TMP_DIR/ens-profile.json" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; records=payload.get("records", {}); assert records.get("org.telegram") == "CounterAgents_Bot", records; assert "counteragent.subnames" in records, records; assert "orchestrator.counteragents.eth" in records["counteragent.subnames"], records; assert "decision.counteragents.eth" in records["counteragent.subnames"], records; print("ENS profile records local check passed")'

curl -fsS http://127.0.0.1:18888/ens/agents/manifest \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; assert "orchestrator.counteragents.eth" in payload.get("subnames", []), payload; agent=next(item for item in payload.get("agents", []) if item.get("role") == "execution"); records=agent.get("records", {}); assert records.get("counteragent.agent.display") == "Uniswap Execution Agent", records; assert "route-diagnostics" in records.get("counteragent.agent.capabilities", ""), records; print("ENS agent manifest local check passed")'

ENS_PLUGIN_URL=http://127.0.0.1:18888 node "$ROOT_DIR/ENS/prepare-agent-ens-records.mjs" \
  | python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload.get("ok") is True, payload; assert "reporting.counteragents.eth" in payload.get("subnames", []), payload; print("ENS agent record script local check passed")'
