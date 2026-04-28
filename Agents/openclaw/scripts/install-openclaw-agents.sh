#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/perkos-agents}"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root on the target server."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 git curl jq ca-certificates openssl ufw
systemctl enable --now docker

mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/agents" "$INSTALL_DIR/secrets"
chmod 700 "$INSTALL_DIR/secrets"

cp "$TEMPLATE_DIR/templates/Dockerfile" "$INSTALL_DIR/Dockerfile"
cp "$TEMPLATE_DIR/templates/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp "$TEMPLATE_DIR/templates/Caddyfile" "$INSTALL_DIR/Caddyfile"
cp "$TEMPLATE_DIR/.env.example" "$INSTALL_DIR/.env.example"
cp "$TEMPLATE_DIR/scripts/start-a0.sh" "$INSTALL_DIR/start-a0.sh"
chmod +x "$INSTALL_DIR/start-a0.sh"

for agent in a0-orchestrator a1-monitor a2-decision a3-execution a4-reporting; do
  mkdir -p "$INSTALL_DIR/agents/$agent/workspace/memory"
  cat > "$INSTALL_DIR/agents/$agent/openclaw.json" <<JSON
{
  "agent": {
    "name": "$agent"
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": 3000
  }
}
JSON
done

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
fi

echo "Installed CounterAgent OpenClaw templates in $INSTALL_DIR"
echo "Next: edit $INSTALL_DIR/.env and run $INSTALL_DIR/start-a0.sh"
