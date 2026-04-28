# OpenClaw agent deployment

Reference setup for running the CounterAgent agent stack with Docker and HTTPS.

## Files

- `.env.example`
- `templates/Dockerfile`
- `templates/docker-compose.yml`
- `templates/Caddyfile`
- `scripts/install-openclaw-agents.sh`
- `scripts/start-a0.sh`
- `plugins/`

## Agents

- A0 Orchestrator: onboarding, registry, ENS provisioning, handoff.
- A1 Monitor: ENS config, balances, FX conditions.
- A2 Decision: HOLD/CONVERT scoring.
- A3 Execution: swap execution.
- A4 Reporting: audit log and alerts.

## Install

```bash
sudo bash Agents/openclaw/scripts/install-openclaw-agents.sh
```

Default target:

```bash
/opt/perkos-agents
```

Custom target:

```bash
sudo INSTALL_DIR=/opt/counteragent-agents bash Agents/openclaw/scripts/install-openclaw-agents.sh
```

## Configure

```bash
cd /opt/perkos-agents
nano .env
```

Minimum for A0:

```env
OPENAI_API_KEY=<OPENAI_API_KEY>
OPENCLAW_TOKEN_A0=<GENERATE_WITH_OPENSSL_RAND_HEX_32>
COUNTERAGENT_DOMAIN=counteragent.perkos.xyz
A0_DOMAIN=orchestrator.counteragent.perkos.xyz
```

Generate tokens:

```bash
openssl rand -hex 32
```

## Start A0

```bash
cd /opt/perkos-agents
./start-a0.sh
```

Verify:

```bash
curl -I https://orchestrator.counteragent.perkos.xyz
```

## Security

Do not commit real `.env` files, API keys, gateway tokens, private keys, or wallet mnemonics.
