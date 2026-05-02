#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GENSYN_DIR="$ROOT_DIR/Gensyn"
PLUGIN_DIR="$GENSYN_DIR/Plugin-Gensyn-AXL-Transport"
REPORT_DIR="$GENSYN_DIR/reports"
RUN_ID="local-evidence-$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$REPORT_DIR/$RUN_ID"
mkdir -p "$RUN_DIR"

copy_log_dir() {
  local source_dir="$1"
  local target_dir="$2"
  if [[ -d "$source_dir" ]]; then
    mkdir -p "$target_dir"
    cp -R "$source_dir"/. "$target_dir"/ 2>/dev/null || true
  fi
}

run_and_capture() {
  local name="$1"
  shift
  echo "running $name"
  set +e
  "$@" >"$RUN_DIR/$name.out" 2>"$RUN_DIR/$name.err"
  local code=$?
  set -e
  echo "$code" >"$RUN_DIR/$name.exit"
  if [[ $code -ne 0 ]]; then
    echo "$name failed with exit $code" >&2
    cat "$RUN_DIR/$name.out" >&2 || true
    cat "$RUN_DIR/$name.err" >&2 || true
    return $code
  fi
  cat "$RUN_DIR/$name.out"
}

cleanup_plugin_deps() {
  rm -rf "$PLUGIN_DIR/node_modules" "$PLUGIN_DIR/package-lock.json" "$PLUGIN_DIR/dist"
}

cleanup_plugin_deps
(
  cd "$PLUGIN_DIR"
  npm install --ignore-scripts >"$RUN_DIR/npm-install.out" 2>"$RUN_DIR/npm-install.err"
  npm run build >"$RUN_DIR/plugin-build.out" 2>"$RUN_DIR/plugin-build.err"
)

run_and_capture shared-plugin-local "$GENSYN_DIR/test-shared-plugin-local.sh"
copy_log_dir "${TMPDIR:-/tmp}/counteragent-gensyn-shared-plugin-logs" "$RUN_DIR/shared-plugin-local-logs"

run_and_capture shared-plugin-workflow "$GENSYN_DIR/test-shared-plugin-counteragent-workflow.sh"
copy_log_dir "${TMPDIR:-/tmp}/counteragent-gensyn-shared-workflow-logs" "$RUN_DIR/shared-plugin-workflow-logs"

cleanup_plugin_deps

WORKFLOW_ID="$(grep -Eo 'shared-plugin-workflow-[0-9]+' "$RUN_DIR/shared-plugin-workflow.out" | tail -1 || true)"
LOCAL_ID="$(grep -Eo 'shared-plugin-local-[0-9]+' "$RUN_DIR/shared-plugin-local.out" | tail -1 || true)"

cat >"$RUN_DIR/report.json" <<JSON
{
  "runId": "$RUN_ID",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "local-shared-plugin",
  "claimLevel": "shared plugin local transport verified; real Gensyn AXL P2P requires separate real nodes",
  "tests": {
    "sharedPluginLocal": {
      "exitCode": $(cat "$RUN_DIR/shared-plugin-local.exit"),
      "workflowId": "$LOCAL_ID",
      "evidence": ["A2 received message", "A3 received message"]
    },
    "sharedPluginWorkflow": {
      "exitCode": $(cat "$RUN_DIR/shared-plugin-workflow.exit"),
      "workflowId": "$WORKFLOW_ID",
      "evidence": ["workflow ok", "transport sent trace ok", "A2 transport inbox ok", "A3 transport inbox ok"]
    }
  },
  "logs": {
    "sharedPluginLocal": "shared-plugin-local-logs/",
    "sharedPluginWorkflow": "shared-plugin-workflow-logs/"
  }
}
JSON

cat >"$RUN_DIR/REPORT.md" <<EOF
# Gensyn transport local evidence

- Run ID: \`$RUN_ID\`
- Created: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- Mode: \`local-shared-plugin\`
- Claim level: shared plugin local transport verified. Real Gensyn AXL P2P still requires separate real nodes.

## Results

### Shared plugin local

- Exit: \`$(cat "$RUN_DIR/shared-plugin-local.exit")\`
- Workflow/test ID: \`$LOCAL_ID\`
- Evidence:
  - A2 received message
  - A3 received message

### Shared plugin CounterAgent workflow

- Exit: \`$(cat "$RUN_DIR/shared-plugin-workflow.exit")\`
- Workflow ID: \`$WORKFLOW_ID\`
- Evidence:
  - workflow ok
  - transport sent trace ok
  - A2 transport inbox ok
  - A3 transport inbox ok

## Logs

- \`shared-plugin-local.out\`
- \`shared-plugin-local.err\`
- \`shared-plugin-local-logs/\`
- \`shared-plugin-workflow.out\`
- \`shared-plugin-workflow.err\`
- \`shared-plugin-workflow-logs/\`
- \`plugin-build.out\`
- \`npm-install.out\`

EOF

echo "Evidence report written to $RUN_DIR"
