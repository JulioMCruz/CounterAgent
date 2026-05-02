#!/usr/bin/env bash
set -euo pipefail

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

is_local_url() {
  [[ "$1" =~ ^https?://(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|/) ]]
}

is_private_url() {
  [[ "$1" =~ ^https?://(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)([0-9]{1,3}\.){1,2}[0-9]{1,3}(:|/) ]]
}

json_get() {
  python3 - "$1" <<'PY'
import json, sys
path = sys.argv[1].split('.')
data = json.load(sys.stdin)
for key in path:
    if isinstance(data, dict):
        data = data.get(key)
    else:
        data = None
print('' if data is None else data)
PY
}

fetch_topology() {
  local node_url="$1"
  local out_file="$2"
  curl -fsS "$node_url/topology" > "$out_file"
  python3 -m json.tool "$out_file" >/dev/null
}

assert_real_topology() {
  local label="$1"
  local file="$2"
  local expected_own_peer="${3:-}"

  python3 - "$label" "$file" "$expected_own_peer" <<'PY'
import json, sys
label, path, expected = sys.argv[1:]
with open(path) as f:
    data = json.load(f)

source = str(data.get('source', '')).lower()
mode = str(data.get('mode', '')).lower()
if source in {'local-adapter', 'mock', 'stub'} or mode == 'adapter':
    raise SystemExit(f'{label} topology is adapter/mock, not real AXL')

own = data.get('our_public_key') or data.get('peer_id') or data.get('peerId') or data.get('node_id') or data.get('nodeId')
if not own:
    raise SystemExit(f'{label} topology missing own public key / peer id')
if expected and own != expected:
    raise SystemExit(f'{label} topology own peer {own} does not match expected {expected}')

peers = data.get('peers') or []
if not isinstance(peers, list):
    raise SystemExit(f'{label} topology peers is not a list')
print(own)
PY
}

assert_peer_visible() {
  local label="$1"
  local file="$2"
  local peer_id="$3"

  python3 - "$label" "$file" "$peer_id" <<'PY'
import json, sys
label, path, peer_id = sys.argv[1:]
with open(path) as f:
    data = json.load(f)
blob = json.dumps(data)
if peer_id not in blob:
    raise SystemExit(f'{label} topology does not include expected peer {peer_id}')
PY
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

poll_recv() {
  local node_url="$1"
  local workflow_id="$2"
  local expected_type="$3"
  local expected_to_agent="$4"
  local expected_nonce="$5"
  local deadline=$((SECONDS + 45))

  while (( SECONDS < deadline )); do
    local payload
    payload="$(curl -fsS "$node_url/recv?limit=20" || true)"
    if [[ -n "$payload" ]]; then
      if printf '%s' "$payload" | python3 -c 'import json, sys
workflow_id, expected_type, expected_to_agent, expected_nonce = sys.argv[1:]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
for message in data.get("messages", []):
    payload = message.get("payload") or {}
    if (
        message.get("workflowId") == workflow_id
        and message.get("messageType") == expected_type
        and message.get("toAgent") == expected_to_agent
        and payload.get("nonce") == expected_nonce
    ):
        print(json.dumps(message))
        sys.exit(0)
sys.exit(1)' "$workflow_id" "$expected_type" "$expected_to_agent" "$expected_nonce"
      then
        return 0
      fi
    fi
    sleep 1
  done

  return 1
}

require_var AXL_A0_URL
require_var AXL_A2_URL
require_var AXL_A3_URL
require_var AXL_PEER_A2
require_var AXL_PEER_A3

AXL_A0_URL="$(trim_slash "$AXL_A0_URL")"
AXL_A2_URL="$(trim_slash "$AXL_A2_URL")"
AXL_A3_URL="$(trim_slash "$AXL_A3_URL")"
REQUIRE_HTTPS_AXL="${REQUIRE_HTTPS_AXL:-true}"
ALLOW_LOCAL_AXL="${ALLOW_LOCAL_AXL:-false}"

if [[ "$REQUIRE_HTTPS_AXL" == "true" ]]; then
  is_https_url "$AXL_A0_URL" || fail "AXL_A0_URL must be HTTPS for real AXL tests"
  is_https_url "$AXL_A2_URL" || fail "AXL_A2_URL must be HTTPS for real AXL tests"
  is_https_url "$AXL_A3_URL" || fail "AXL_A3_URL must be HTTPS for real AXL tests"
fi
ALLOW_PRIVATE_AXL="${ALLOW_PRIVATE_AXL:-false}"

if [[ "$ALLOW_LOCAL_AXL" != "true" ]]; then
  is_local_url "$AXL_A0_URL" && fail "AXL_A0_URL is local; set ALLOW_LOCAL_AXL=true only for intentional multi-process local node tests"
  is_local_url "$AXL_A2_URL" && fail "AXL_A2_URL is local; set ALLOW_LOCAL_AXL=true only for intentional multi-process local node tests"
  is_local_url "$AXL_A3_URL" && fail "AXL_A3_URL is local; set ALLOW_LOCAL_AXL=true only for intentional multi-process local node tests"
fi

if [[ "$ALLOW_PRIVATE_AXL" != "true" ]]; then
  is_private_url "$AXL_A0_URL" && fail "AXL_A0_URL is private LAN; set ALLOW_PRIVATE_AXL=true only if these are separate real AXL hosts"
  is_private_url "$AXL_A2_URL" && fail "AXL_A2_URL is private LAN; set ALLOW_PRIVATE_AXL=true only if these are separate real AXL hosts"
  is_private_url "$AXL_A3_URL" && fail "AXL_A3_URL is private LAN; set ALLOW_PRIVATE_AXL=true only if these are separate real AXL hosts"
fi

if [[ "$AXL_A0_URL" == "$AXL_A2_URL" || "$AXL_A0_URL" == "$AXL_A3_URL" || "$AXL_A2_URL" == "$AXL_A3_URL" ]]; then
  fail "AXL_A0_URL, AXL_A2_URL, and AXL_A3_URL must be separate node APIs"
fi

TMP_DIR="${TMPDIR:-/tmp}/counteragent-real-axl"
mkdir -p "$TMP_DIR"

A0_TOPOLOGY="$TMP_DIR/a0-topology.json"
A2_TOPOLOGY="$TMP_DIR/a2-topology.json"
A3_TOPOLOGY="$TMP_DIR/a3-topology.json"

echo "checking real topology on all AXL nodes"
fetch_topology "$AXL_A0_URL" "$A0_TOPOLOGY"
fetch_topology "$AXL_A2_URL" "$A2_TOPOLOGY"
fetch_topology "$AXL_A3_URL" "$A3_TOPOLOGY"

A0_OWN_PEER="$(assert_real_topology A0 "$A0_TOPOLOGY")"
A2_OWN_PEER="$(assert_real_topology A2 "$A2_TOPOLOGY" "$AXL_PEER_A2")"
A3_OWN_PEER="$(assert_real_topology A3 "$A3_TOPOLOGY" "$AXL_PEER_A3")"

[[ "$A0_OWN_PEER" != "$A2_OWN_PEER" && "$A0_OWN_PEER" != "$A3_OWN_PEER" && "$A2_OWN_PEER" != "$A3_OWN_PEER" ]] || fail "topologies report duplicate own peer IDs; not separate AXL nodes"

assert_peer_visible A0 "$A0_TOPOLOGY" "$AXL_PEER_A2"
assert_peer_visible A0 "$A0_TOPOLOGY" "$AXL_PEER_A3"

echo "A0 peer: $A0_OWN_PEER"
echo "A2 peer: $A2_OWN_PEER"
echo "A3 peer: $A3_OWN_PEER"

WORKFLOW_ID="real-axl-p2p-$(date +%s)"
NONCE_A2="nonce-a2-$RANDOM-$RANDOM"
NONCE_A3="nonce-a3-$RANDOM-$RANDOM"

cat > "$TMP_DIR/a0-to-a2.json" <<JSON
{
  "workflowId": "$WORKFLOW_ID",
  "messageId": "$WORKFLOW_ID-a2",
  "sequence": 1,
  "fromAgent": "A0-Orchestrator",
  "toAgent": "A2-Decision",
  "messageType": "real-p2p-a2-ping",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "payload": { "test": "real-axl-p2p", "target": "A2", "nonce": "$NONCE_A2", "fromPeer": "$A0_OWN_PEER", "toPeer": "$AXL_PEER_A2" }
}
JSON

cat > "$TMP_DIR/a0-to-a3.json" <<JSON
{
  "workflowId": "$WORKFLOW_ID",
  "messageId": "$WORKFLOW_ID-a3",
  "sequence": 2,
  "fromAgent": "A0-Orchestrator",
  "toAgent": "A3-Uniswap-SwapExecution",
  "messageType": "real-p2p-a3-ping",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "payload": { "test": "real-axl-p2p", "target": "A3", "nonce": "$NONCE_A3", "fromPeer": "$A0_OWN_PEER", "toPeer": "$AXL_PEER_A3" }
}
JSON

echo "sending A0 -> A2 through AXL peer $AXL_PEER_A2"
post_json "$AXL_A0_URL" "$AXL_PEER_A2" "$TMP_DIR/a0-to-a2.json" >/dev/null

echo "waiting for A2 recv with nonce $NONCE_A2"
poll_recv "$AXL_A2_URL" "$WORKFLOW_ID" "real-p2p-a2-ping" "A2-Decision" "$NONCE_A2" >/dev/null || fail "A2 did not receive P2P AXL message with expected nonce"

echo "sending A0 -> A3 through AXL peer $AXL_PEER_A3"
post_json "$AXL_A0_URL" "$AXL_PEER_A3" "$TMP_DIR/a0-to-a3.json" >/dev/null

echo "waiting for A3 recv with nonce $NONCE_A3"
poll_recv "$AXL_A3_URL" "$WORKFLOW_ID" "real-p2p-a3-ping" "A3-Uniswap-SwapExecution" "$NONCE_A3" >/dev/null || fail "A3 did not receive P2P AXL message with expected nonce"

echo "real AXL P2P send/recv passed: $WORKFLOW_ID"
