#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${COUNTERAGENT_BASE_URL:-https://counteragents.cc}"
A0_URL="${A0_URL:-$BASE_URL/api/a0}"
MERCHANT="${MERCHANT_WALLET:-0x987D68A59a5A2Ff39B723abFaD6678fd22D3510b}"
CHAIN_ID="${CHAIN_ID:-84532}"
FROM_TOKEN="${FROM_TOKEN:-USDC}"
TO_TOKEN="${TO_TOKEN:-EURC}"
AMOUNT="${AMOUNT:-5}"
BASELINE_RATE="${BASELINE_RATE:-0.93}"
LIVE_ROUTE_RATE="${LIVE_ROUTE_RATE:-0.95}"
THRESHOLD_BPS="${THRESHOLD_BPS:-50}"
SLIPPAGE_BPS="${SLIPPAGE_BPS:-50}"
AUTHORIZED_AGENT="${AUTHORIZED_AGENT:-0xDaa23fF7820b92eA5D78457adc41Cab1af97EbbC}"
FROM_TOKEN_SLUG="$(printf '%s' "$FROM_TOKEN" | tr '[:upper:]' '[:lower:]')"
TO_TOKEN_SLUG="$(printf '%s' "$TO_TOKEN" | tr '[:upper:]' '[:lower:]')"
WORKFLOW_ID="${WORKFLOW_ID:-autonomous-vault-${FROM_TOKEN_SLUG}-${TO_TOKEN_SLUG}-$(date +%s)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${TMPDIR:-/tmp}/counteragent-autonomous-vault-$WORKFLOW_ID}"
mkdir -p "$EVIDENCE_DIR"
export WORKFLOW_ID FROM_TOKEN TO_TOKEN AMOUNT

post_json() {
  local url="$1"
  local input="$2"
  local output="$3"
  curl -fsS --max-time 75 \
    -H 'content-type: application/json' \
    -d @"$input" \
    "$url" > "$output"
}

get_json() {
  local url="$1"
  local output="$2"
  curl -fsS --max-time 30 "$url" > "$output"
}

assert_jq() {
  local file="$1"
  local expr="$2"
  local label="$3"
  if ! jq -e "$expr" "$file" >/dev/null; then
    echo "FAIL: $label" >&2
    echo "File: $file" >&2
    jq . "$file" >&2 || cat "$file" >&2
    exit 1
  fi
  echo "ok - $label"
}

echo "Evidence: $EVIDENCE_DIR"
echo "A0 URL: $A0_URL"
echo "Workflow: $WORKFLOW_ID"

cat > "$EVIDENCE_DIR/vault-plan.json" <<JSON
{
  "walletAddress": "$MERCHANT",
  "chainId": $CHAIN_ID,
  "preferredStablecoin": "$TO_TOKEN",
  "mode": "moderate",
  "authorizedAgent": "$AUTHORIZED_AGENT",
  "targetAllowlist": ["0x492E6456D9528771018DeB9E87ef7750EF184104"]
}
JSON
post_json "$A0_URL/vault/plan" "$EVIDENCE_DIR/vault-plan.json" "$EVIDENCE_DIR/vault-plan-result.json"
assert_jq "$EVIDENCE_DIR/vault-plan-result.json" '.ok == true and .custodyModel == "merchant-owned-non-custodial"' "vault plan is merchant-owned non-custodial"
assert_jq "$EVIDENCE_DIR/vault-plan-result.json" '.vault.tokenAllowlist | map(.symbol) | index(env.FROM_TOKEN) and index(env.TO_TOKEN)' "vault token allowlist contains $FROM_TOKEN and $TO_TOKEN"
assert_jq "$EVIDENCE_DIR/vault-plan-result.json" '.vault.authorizedAgent != null and (.vault.policy.active == true)' "vault policy authorizes A3 with active guardrails"
assert_jq "$EVIDENCE_DIR/vault-plan-result.json" '.vault.policy.maxTradeAmount and .vault.policy.dailyLimit and (.vault.policy.maxSlippageBps <= 1000)' "vault guardrails expose trade cap, daily limit, slippage"

cat > "$EVIDENCE_DIR/workflow.json" <<JSON
{
  "workflowId": "$WORKFLOW_ID",
  "idempotencyKey": "$WORKFLOW_ID",
  "merchantEns": "vault.counteragents.eth",
  "walletAddress": "$MERCHANT",
  "chainId": $CHAIN_ID,
  "fromToken": "$FROM_TOKEN",
  "toToken": "$TO_TOKEN",
  "amount": "$AMOUNT",
  "fxThresholdBps": $THRESHOLD_BPS,
  "riskTolerance": "moderate",
  "slippageBps": $SLIPPAGE_BPS,
  "baselineRate": $BASELINE_RATE,
  "dryRunRate": $LIVE_ROUTE_RATE,
  "metadata": {
    "source": "autonomous-vault-dashboard-test",
    "custody": "merchant-owned-vault",
    "noHumanInLoopAfterDeposit": true,
    "demoPair": "$AMOUNT $FROM_TOKEN -> $TO_TOKEN"
  }
}
JSON
post_json "$A0_URL/workflow/evaluate" "$EVIDENCE_DIR/workflow.json" "$EVIDENCE_DIR/workflow-result.json"
assert_jq "$EVIDENCE_DIR/workflow-result.json" '.ok == true and .workflowId == env.WORKFLOW_ID' "workflow response is ok and idempotent"
assert_jq "$EVIDENCE_DIR/workflow-result.json" '.quote.quote.rate > .quote.quote.baselineRate and .decision.decision.action == "CONVERT" and .decision.decision.netScoreBps >= 50 and .execution.status != "skipped" and .execution.status != null' "profitable $AMOUNT $FROM_TOKEN to $TO_TOKEN path converts autonomously"
assert_jq "$EVIDENCE_DIR/workflow-result.json" '.report != null and (.report.ok == true or .report.reportId or .report.storageUri or .report.contentHash or .report.rootHash)' "A4 report/audit pointer is produced"

sleep 2
get_json "$A0_URL/axl/status" "$EVIDENCE_DIR/axl-status.json"
assert_jq "$EVIDENCE_DIR/axl-status.json" '.mode == "transport" and .fallbackToHttp == true' "AXL transport is live with HTTP fallback for unsupported MCP tools"
assert_jq "$EVIDENCE_DIR/axl-status.json" '[.recentMessages[] | select(.workflowId == env.WORKFLOW_ID)] | length >= 12' "AXL recent messages include this autonomous workflow"
assert_jq "$EVIDENCE_DIR/axl-status.json" '
  [.recentMessages[] | select(.workflowId == env.WORKFLOW_ID) | .messageType] as $types |
  (["merchant-config-request","quote-request","decision-request","execution-request","report-request","report-response"] | all(. as $t | $types | index($t)))
' "AXL trace includes A1 monitor, A2 decision, A3 execution, A4 report stages"
assert_jq "$EVIDENCE_DIR/axl-status.json" '
  [.recentMessages[] | select(.workflowId == env.WORKFLOW_ID and (.messageType | test("mcp-(request|error)") | not)) | .axl.ok] | all(. == true)
' "required AXL messages for workflow are ok; unsupported MCP tools can fall back to HTTP"

get_json "$A0_URL/dashboard/state?merchant=$MERCHANT" "$EVIDENCE_DIR/dashboard-state.json"
assert_jq "$EVIDENCE_DIR/dashboard-state.json" '(.decisions // [] | any(.workflowId == env.WORKFLOW_ID and .action == "CONVERT")) and (.executions // [] | any(.workflowId == env.WORKFLOW_ID and .status != "skipped"))' "dashboard state records decision and execution for Alerts/Dashboard"

curl -fsS --max-time 30 "$BASE_URL/alerts" -o "$EVIDENCE_DIR/alerts.html"
if ! grep -q 'app/(app)/alerts/page' "$EVIDENCE_DIR/alerts.html"; then
  echo "FAIL: Alerts page bundle was not referenced" >&2
  exit 1
fi
echo "ok - Alerts route renders; live AXL workflow messages above are the alert feed source"

echo "PASS autonomous vault dashboard flow"
echo "Evidence directory: $EVIDENCE_DIR"
