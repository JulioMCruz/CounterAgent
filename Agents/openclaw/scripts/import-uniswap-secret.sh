#!/usr/bin/env bash
set -euo pipefail

INSTALL_ENV="${INSTALL_ENV:-}"
SECRET_ENV="${COUNTERAGENT_UNISWAP_ENV:-${HOME}/.openclaw/secrets/counteragent-uniswap.env}"

if [[ -z "$INSTALL_ENV" ]]; then
  echo "Set INSTALL_ENV to the target agent .env file on the active AWS EC2 host." >&2
  exit 1
fi

if [[ ! -f "$SECRET_ENV" ]]; then
  echo "Missing Uniswap secret env file: $SECRET_ENV" >&2
  exit 1
fi

if [[ ! -f "$INSTALL_ENV" ]]; then
  echo "Missing install env file: $INSTALL_ENV" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$SECRET_ENV"
set +a

if [[ -z "${UNISWAP_API_KEY:-}" || "$UNISWAP_API_KEY" == *"<"* ]]; then
  echo "UNISWAP_API_KEY is missing or placeholder in $SECRET_ENV" >&2
  exit 1
fi

python3 - "$INSTALL_ENV" <<'PY'
import os, pathlib, sys
path = pathlib.Path(sys.argv[1])
updates = {
    "UNISWAP_API_KEY": os.environ["UNISWAP_API_KEY"],
    "UNISWAP_QUOTE_MODE": os.environ.get("UNISWAP_QUOTE_MODE", "api-first"),
    "UNISWAP_API_URL": os.environ.get("UNISWAP_API_URL", "https://trade-api.gateway.uniswap.org/v1"),
    "UNISWAP_RETRY_COUNT": os.environ.get("UNISWAP_RETRY_COUNT", "2"),
    "UNISWAP_TIMEOUT_MS": os.environ.get("UNISWAP_TIMEOUT_MS", "10000"),
}
lines = path.read_text().splitlines()
seen = set()
next_lines = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
    if key in updates:
        next_lines.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        next_lines.append(line)
for key, value in updates.items():
    if key not in seen:
        next_lines.append(f"{key}={value}")
path.write_text("\n".join(next_lines) + "\n")
PY

chmod 600 "$INSTALL_ENV"
echo "Imported Uniswap env into $INSTALL_ENV (values hidden). Restart A3 after this."
