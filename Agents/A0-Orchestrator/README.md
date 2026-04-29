Agent 0 — Orchestrator

Entry point and coordinator. Initialises the pipeline, passes context between agents, manages failure and recovery paths. The merchant interacts only here. All agents report back to the Orchestrator. Sends Telegram alerts to the merchant on critical halts and anomalies.

The Orchestrator is also the public app-facing agent. The App should call the Orchestrator over HTTPS for onboarding and orchestration requests. See `app-orchestrator-integration.md` for the recommended endpoint contract and security model.

Plugin/service reference lives in `Plugin-CounterAgent/`. It contains the App-facing `POST /onboarding/start` skeleton for the Orchestrator integration.

## ETHSkills for A0

Use ETHSkills selectively when changing onboarding, wallet signatures, chain routing, registry writes, or production QA. Recommended set:

```bash
node ../scripts/install-ethskills.mjs --agent A0-Orchestrator
```

Primary skills for A0:

- `frontend-ux` — wallet popups, explicit network switching, signing flows.
- `wallets` — wallet-agnostic signing and account safety.
- `l2s` — Base/Base Sepolia routing and RPC expectations.
- `standards` — EIP-712/typed-data and agent identity standards.
- `security` — relayer/private-key/signature safety before deploy.
- `qa` — independent dApp QA before demo or production handoff.
