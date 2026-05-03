#!/usr/bin/env bash
set -euo pipefail

A0_URL="${A0_URL:-https://counteragents.cc/api/a0}"
A0_DIRECT_URL="${A0_DIRECT_URL:-http://52.200.130.200}"
A1_URL="${A1_URL:-http://18.234.193.184}"
A2_URL="${A2_URL:-http://54.166.11.128}"
A3_URL="${A3_URL:-http://34.226.160.114}"
A4_URL="${A4_URL:-http://107.23.81.60}"

AXL_PEER_A1="${AXL_PEER_A1:-87c3ecafcc3fe0a707ca941df307f888d44551f1186d63b5075399fef061d5fb}"
AXL_PEER_A2="${AXL_PEER_A2:-5ac8083de65af82381c2a26ba68ff53a454ce6464dc09f83f2bdb9c91c77a836}"
AXL_PEER_A3="${AXL_PEER_A3:-f193064938e9a64e86894bf8bed75fedb7ba285b569a070ca72949368e5d6cbd}"
AXL_PEER_A4="${AXL_PEER_A4:-161f75861439c89892f66e457b12011fd3a283147d3cd503ce5eedfc8775ba92}"

GENSYN_AXL_SERVICE_A1="${GENSYN_AXL_SERVICE_A1:-counteragent-monitor}"
GENSYN_AXL_SERVICE_A2="${GENSYN_AXL_SERVICE_A2:-counteragent-decision}"
GENSYN_AXL_SERVICE_A3="${GENSYN_AXL_SERVICE_A3:-counteragent-execution}"
GENSYN_AXL_SERVICE_A4="${GENSYN_AXL_SERVICE_A4:-counteragent-reporting}"

EVIDENCE_DIR="${EVIDENCE_DIR:-${TMPDIR:-/tmp}/counteragent-live-axl-evidence-$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$EVIDENCE_DIR"

fail() {
  echo "error: $*" >&2
  echo "evidence: $EVIDENCE_DIR" >&2
  exit 1
}

post_json() {
  local url="$1" file="$2" out="$3"
  curl -fsS --max-time 180 -X POST "$url" -H 'content-type: application/json' --data-binary "@$file" | tee "$out"
}

get_json() {
  local url="$1" out="$2"
  curl -fsS --max-time 30 "$url" | tee "$out"
}

cat > "$EVIDENCE_DIR/mcp-tools-list.json" <<'JSON'
{"jsonrpc":"2.0","id":"tools-list","method":"tools/list","params":{}}
JSON

cat > "$EVIDENCE_DIR/a1-lookup-unknown.json" <<'JSON'
{"jsonrpc":"2.0","id":"lookup-unknown","method":"tools/call","params":{"name":"lookup_merchant_config","arguments":{"walletAddress":"0x0000000000000000000000000000000000000001"}}}
JSON

cat > "$EVIDENCE_DIR/onboarding-prepare.json" <<'JSON'
{
  "walletAddress":"0x0000000000000000000000000000000000000001",
  "chainId":84532,
  "ensName":"pretest.counteragents.eth",
  "fxThresholdBps":50,
  "riskTolerance":"Moderate",
  "preferredStablecoin":"USDC",
  "telegramChat":""
}
JSON

WORKFLOW_ID="live-axl-evidence-$(date +%s)"
cat > "$EVIDENCE_DIR/workflow.json" <<JSON
{
  "idempotencyKey":"$WORKFLOW_ID",
  "walletAddress":"0x0000000000000000000000000000000000000001",
  "chainId":84532,
  "fromToken":"EURC",
  "toToken":"USDC",
  "amount":"100.00",
  "fxThresholdBps":10,
  "riskTolerance":"moderate",
  "slippageBps":50,
  "dryRunRate":1.02,
  "baselineRate":1,
  "metadata":{"evidence":"live-production-axl"}
}
JSON

echo "Evidence directory: $EVIDENCE_DIR"

echo "Checking A0-A4 health"
get_json "$A0_URL/healthz" "$EVIDENCE_DIR/a0-health.json" >/dev/null
get_json "$A1_URL/healthz" "$EVIDENCE_DIR/a1-health.json" >/dev/null
get_json "$A2_URL/healthz" "$EVIDENCE_DIR/a2-health.json" >/dev/null
get_json "$A3_URL/healthz" "$EVIDENCE_DIR/a3-health.json" >/dev/null
get_json "$A4_URL/healthz" "$EVIDENCE_DIR/a4-health.json" >/dev/null

python3 - "$EVIDENCE_DIR" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
for role in ['a0','a1','a2','a3','a4']:
    data=json.loads((root/f'{role}-health.json').read_text())
    assert data.get('ok') is True, f'{role} health not ok'
a0=json.loads((root/'a0-health.json').read_text())
assert a0.get('agents',{}).get('registryRelayerConfigured') is True, 'A0 registry relayer not configured'
a4=json.loads((root/'a4-health.json').read_text())
assert a4.get('mcp',{}).get('service') == 'counteragent-reporting', 'A4 MCP service missing'
print('health ok')
PY

echo "Checking A0 AXL topology/status"
get_json "$A0_URL/axl/status" "$EVIDENCE_DIR/a0-axl-status-before.json" >/dev/null
python3 - "$EVIDENCE_DIR/a0-axl-status-before.json" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
assert data.get('mode') == 'transport', 'A0 not in transport mode'
assert data.get('fallbackToHttp') is False, 'A0 fallbackToHttp is not false'
peers=data.get('peers') or {}
assert all(peers.get(r) is True for r in ['A1','A2','A3','A4']), f'peers not all configured: {peers}'
print('axl status ok')
PY

echo "Checking real AXL MCP tools/list routes"
declare -a routes=(
  "A1 $AXL_PEER_A1 $GENSYN_AXL_SERVICE_A1"
  "A2 $AXL_PEER_A2 $GENSYN_AXL_SERVICE_A2"
  "A3 $AXL_PEER_A3 $GENSYN_AXL_SERVICE_A3"
  "A4 $AXL_PEER_A4 $GENSYN_AXL_SERVICE_A4"
)
for route in "${routes[@]}"; do
  read -r role peer service <<<"$route"
  role_lc=$(printf '%s' "$role" | tr '[:upper:]' '[:lower:]')
  post_json "$A0_DIRECT_URL/axl/mcp/$peer/$service" "$EVIDENCE_DIR/mcp-tools-list.json" "$EVIDENCE_DIR/${role_lc}-tools-list.json" >/dev/null
  python3 - "$EVIDENCE_DIR/${role_lc}-tools-list.json" "$role" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
role=sys.argv[2]
assert 'result' in data, f'{role} tools/list missing result: {data}'
assert data['result'].get('tools'), f'{role} tools/list empty'
print(f'{role} tools/list ok')
PY
done

echo "Checking A1 lookup returns structured MCP result"
post_json "$A0_DIRECT_URL/axl/mcp/$AXL_PEER_A1/$GENSYN_AXL_SERVICE_A1" "$EVIDENCE_DIR/a1-lookup-unknown.json" "$EVIDENCE_DIR/a1-lookup-unknown-result.json" >/dev/null
python3 - "$EVIDENCE_DIR/a1-lookup-unknown-result.json" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
assert 'result' in data, f'A1 lookup returned JSON-RPC error: {data}'
content=data['result'].get('content') or []
text=content[0].get('text') if content else ''
inner=json.loads(text)
assert inner.get('ok') is False and inner.get('error') == 'ens_merchant_not_found', inner
print('A1 lookup structured result ok')
PY

echo "Checking onboarding prepare typed-data"
post_json "$A0_URL/onboarding/prepare" "$EVIDENCE_DIR/onboarding-prepare.json" "$EVIDENCE_DIR/onboarding-prepare-result.json" >/dev/null
python3 - "$EVIDENCE_DIR/onboarding-prepare-result.json" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
assert data.get('ok') is True, data
assert data.get('domain',{}).get('chainId') == 84532, data.get('domain')
assert data.get('domain',{}).get('verifyingContract') == '0x9857d987F57607b1e6431Ab94D26a866870b7a3D', data.get('domain')
assert data.get('primaryType') == 'Register', data.get('primaryType')
print('onboarding prepare ok')
PY

echo "Running live production AXL workflow"
post_json "$A0_URL/workflow/evaluate" "$EVIDENCE_DIR/workflow.json" "$EVIDENCE_DIR/workflow-result.json" >/dev/null
python3 - "$EVIDENCE_DIR/workflow-result.json" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
assert data.get('ok') is True, data
assert data.get('status') == 'completed', data.get('status')
assert data.get('decision',{}).get('decision',{}).get('action') in {'CONVERT','HOLD'}, data.get('decision')
assert data.get('execution',{}).get('status') in {'dry-run','fallback-dry-run','skipped'}, data.get('execution')
assert data.get('report',{}).get('ok') is True, data.get('report')
assert data.get('reportWarning') in (None, ''), data.get('reportWarning')
print('workflow ok')
PY

echo "Checking recent AXL trace contains clean A1-A4 messages for workflow"
get_json "$A0_URL/axl/status" "$EVIDENCE_DIR/a0-axl-status-after.json" >/dev/null
python3 - "$EVIDENCE_DIR/a0-axl-status-after.json" "$WORKFLOW_ID" <<'PY'
import json, sys
data=json.load(open(sys.argv[1]))
workflow_id=sys.argv[2]
msgs=[m for m in data.get('recentMessages', []) if m.get('workflowId') == workflow_id]
assert msgs, 'no recent messages for workflow'
by_type={m.get('messageType'):m for m in msgs}
required=['merchant-config-request','lookup_merchant_config-mcp-request','lookup_merchant_config-mcp-response','quote-request','get_quote-mcp-response','decision-request','evaluate_decision-mcp-response','execution-request','execute_swap-mcp-response','report-request','publish_report-mcp-response','report-response']
missing=[m for m in required if m not in by_type]
assert not missing, f'missing messages: {missing}'
failed=[m for m in msgs if (m.get('axl') or {}).get('ok') is not True]
assert not failed, f'failed messages: {failed}'
transports={(m.get('axl') or {}).get('transport') for m in msgs}
assert 'axl-send' in transports and 'axl-mcp' in transports and 'axl-observed' in transports, transports
print('clean AXL message evidence ok')
PY

cat > "$EVIDENCE_DIR/summary.txt" <<EOF
CounterAgent live production AXL evidence
Workflow: $WORKFLOW_ID
A0 URL: $A0_URL
Evidence directory: $EVIDENCE_DIR
Result: PASS
EOF

cat "$EVIDENCE_DIR/summary.txt"
