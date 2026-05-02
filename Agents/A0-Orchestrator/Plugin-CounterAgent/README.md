# Plugin CounterAgent

Reference implementation for the Orchestrator service API used by the App.

This folder demonstrates where the App-facing integration code should live for the Orchestrator. The goal is to expose a stable HTTPS contract that the App can call without exposing runtime credentials or internal agent ports.

## Public contract

```text
POST <ORCHESTRATOR_URL>/session/resolve
POST <ORCHESTRATOR_URL>/onboarding/start
POST <ORCHESTRATOR_URL>/workflow/evaluate
```

Local development default:

```text
POST http://localhost:8787/session/resolve
POST http://localhost:8787/onboarding/start
POST http://localhost:8787/workflow/evaluate
```

## Session resolution

After wallet login, the App calls the Orchestrator to decide where the user should go next.

```http
POST /session/resolve
```

Request:

```json
{
  "walletAddress": "0x...",
  "chainId": 84532
}
```

Registered response:

```json
{
  "ok": true,
  "route": "dashboard",
  "registered": true,
  "merchant": {
    "walletAddress": "0x...",
    "fxThresholdBps": 100,
    "risk": 1,
    "preferredStablecoin": "0x...",
    "telegramChatId": "0x...",
    "active": true
  }
}
```

Unregistered response:

```json
{
  "ok": true,
  "route": "onboarding",
  "registered": false,
  "reason": "merchant_not_registered"
}
```

If `MERCHANT_REGISTRY_ADDRESS` is not configured, the Orchestrator returns `route: "onboarding"` with `reason: "merchant_registry_not_configured"`.

## Onboarding start

The App calls this endpoint to start or resume onboarding after collecting merchant preferences.

```http
POST /onboarding/start
```

## Responsibilities

The plugin/service should:

1. Accept onboarding requests from the App.
2. Validate wallet address, chain ID, and merchant metadata.
3. Verify wallet ownership or signed payload before privileged actions.
4. Check or coordinate `MerchantRegistry` state.
5. Call the Monitor agent service to provision ENS subnames.
6. Call the Reporting agent service to publish an onboarding report artifact.
7. Return an idempotent onboarding status, ENS result, and report pointer to the App.
8. Route the user to dashboard when onboarding is complete.

When `MONITOR_AGENT_URL` is configured, `/onboarding/start` calls:

```text
POST <MONITOR_AGENT_URL>/ens/provision
```

If `MONITOR_AGENT_URL` is missing, the Orchestrator accepts the request but returns `ens.status: "monitor_agent_not_configured"`.

When `REPORTING_AGENT_URL` is configured, `/onboarding/start` calls:

```text
POST <REPORTING_AGENT_URL>/reports/publish
```

The response includes `report.storageUri`, which is expected to be `0g://<rootHash>` when the Reporting agent runs with `REPORT_STORAGE_MODE=0g`.

## Treasury workflow evaluation

The App or an operator can ask the Orchestrator to run a complete dry-run treasury workflow:

```http
POST /workflow/evaluate
```

Flow:

```text
Orchestrator
  -> Gensyn AXL Agent Messaging plugin /axl/messages for structured inter-agent envelopes
  -> Uniswap Swap Execution plugin /execution/quote
  -> Decision Scoring plugin /decision/evaluate
  -> Uniswap Swap Execution plugin /execution/execute
  -> Reporting plugin /reports/publish
```

Example request:

```json
{
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "chainId": 8453,
  "merchantEns": "demo.counteragents.eth",
  "fromToken": "EURC",
  "toToken": "USDC",
  "amount": "800",
  "fxThresholdBps": 50,
  "riskTolerance": "moderate",
  "baselineRate": 1.07
}
```

When `DECISION_AGENT_URL`, `EXECUTION_AGENT_URL`, and `REPORTING_AGENT_URL` are configured, the response includes `quote`, `decision`, `execution`, and `report` objects. When `GENSYN_AXL_MESSAGING_URL` is configured, A0 also emits sponsor-visible AXL-style message envelopes for quote, decision, and execution handoffs. The Uniswap plugin defaults to dry-run execution, so `transactionHash` remains `null` until live execution is explicitly enabled.

## Recommended implementation path

Implement this first as a small HTTPS sidecar service that runs with the Orchestrator container.

Later, if deeper runtime integration is needed, this can become a formal agent plugin while keeping the same external API contract.

## Security rules

- HTTPS only in deployed environments.
- Never send runtime credentials to the browser.
- Require a wallet signature, SIWE-style proof, or server-side signed request before privileged operations.
- Keep requests idempotent by wallet address + chain ID or an explicit idempotency key.
- Validate `registryTxHash` on Base before trusting it.
- Keep A2A/debug ports local only.

## Files

- `src/server.ts` — service with `GET /healthz`, `POST /session/resolve`, `POST /onboarding/start`, and `POST /workflow/evaluate`.
- `package.json` — dependencies and scripts for local development.
- `.env.example` — safe placeholders only.
