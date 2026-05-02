#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/Gensyn/env.real-axl.example" && "${LOAD_EXAMPLE_ENV:-false}" == "true" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/Gensyn/env.real-axl.example"
fi

: "${AXL_A0_URL:?Set AXL_A0_URL, for example https://orchestrator.counteragents.cc/axl}"
: "${AXL_A1_URL:?Set AXL_A1_URL, for example https://monitor.counteragents.cc/axl}"
: "${AXL_A2_URL:?Set AXL_A2_URL, for example https://decision.counteragents.cc/axl}"
: "${AXL_A3_URL:?Set AXL_A3_URL, for example https://execution.counteragents.cc/axl}"
: "${AXL_A4_URL:?Set AXL_A4_URL, for example https://reporting.counteragents.cc/axl}"
: "${AXL_PEER_A1:?Set AXL_PEER_A1 from A1 /axl/topology}"
: "${AXL_PEER_A2:?Set AXL_PEER_A2 from A2 /axl/topology}"
: "${AXL_PEER_A3:?Set AXL_PEER_A3 from A3 /axl/topology}"
: "${AXL_PEER_A4:?Set AXL_PEER_A4 from A4 /axl/topology}"

export REQUIRE_HTTPS_AXL="${REQUIRE_HTTPS_AXL:-true}"
export GENSYN_AXL_SERVICE_A1="${GENSYN_AXL_SERVICE_A1:-counteragent-monitor}"
export GENSYN_AXL_SERVICE_A2="${GENSYN_AXL_SERVICE_A2:-counteragent-decision}"
export GENSYN_AXL_SERVICE_A3="${GENSYN_AXL_SERVICE_A3:-counteragent-execution}"
export GENSYN_AXL_SERVICE_A4="${GENSYN_AXL_SERVICE_A4:-counteragent-reporting}"

"$ROOT_DIR/Gensyn/test-real-axl-p2p.sh"
"$ROOT_DIR/Gensyn/test-real-axl-counteragent-workflow.sh"

echo "All-agent AXL communication checks passed."
