#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run() {
  echo
  echo "==> $*"
  "$@"
}

run npm --prefix Agents/A0-Orchestrator/Plugin-CounterAgent run build
run npm --prefix Agents/A1-Monitor/Plugin-ENS-MerchantConfig run build
run npm --prefix Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring run build
run npm --prefix Agents/A3-Execution/Plugin-Uniswap-SwapExecution run build
run npm --prefix Agents/A4-Reporting/Plugin-CounterAgent run build
run npm --prefix Agents/A4-Reporting/Plugin-Telegram-Alerts run build
run npm --prefix Gensyn/Plugin-Gensyn-AXL-Transport run build
run npm --prefix App run lint

if command -v forge >/dev/null 2>&1; then
  run npm --prefix Contracts test
else
  echo "forge is required for Contracts tests but was not found in PATH" >&2
  exit 127
fi

run bash scripts/test-counteragent-services-local.sh

echo
echo "CounterAgent all local gates passed"
