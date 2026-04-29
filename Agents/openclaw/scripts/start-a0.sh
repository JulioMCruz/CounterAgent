#!/usr/bin/env bash
set -euo pipefail

cd /opt/perkos-agents

if [[ ! -f .env ]]; then
  echo "Missing /opt/perkos-agents/.env"
  echo "Copy the deployment env template to /opt/perkos-agents/.env and fill the required API keys and tokens."
  exit 1
fi

if grep -q '<OPENAI_API_KEY>\|PASTE_OPENAI_API_KEY_HERE' .env; then
  echo "OPENAI_API_KEY is still a placeholder in /opt/perkos-agents/.env"
  exit 1
fi

docker compose up -d --build a0-orchestrator reverse-proxy

docker compose ps a0-orchestrator reverse-proxy
