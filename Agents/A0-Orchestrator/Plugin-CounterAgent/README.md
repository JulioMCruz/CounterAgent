# Plugin CounterAgent

Reference implementation for the Orchestrator service API used by the App.

This folder demonstrates where the App-facing integration code should live for the Orchestrator. The goal is to expose a stable HTTPS contract that the App can call without exposing OpenClaw tokens or internal agent ports.

## Public contract

```text
POST https://orchestrator.counteragent.perkos.xyz/session/resolve
POST https://orchestrator.counteragent.perkos.xyz/onboarding/start
```

Local development default:

```text
POST http://localhost:8787/session/resolve
POST http://localhost:8787/onboarding/start
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
6. Return an idempotent onboarding status to the App.
7. Route the user to dashboard when onboarding is complete.

When `MONITOR_AGENT_URL` is configured, `/onboarding/start` calls:

```text
POST <MONITOR_AGENT_URL>/ens/provision
```

If `MONITOR_AGENT_URL` is missing, the Orchestrator accepts the request but returns `ens.status: "monitor_agent_not_configured"`.

## Recommended implementation path

Implement this first as a small HTTPS sidecar service that runs with the Orchestrator container.

Later, if deeper OpenClaw runtime integration is needed, this can become a formal OpenClaw plugin while keeping the same external API contract.

## Security rules

- HTTPS only in deployed environments.
- Never send OpenClaw tokens to the browser.
- Require a wallet signature, SIWE-style proof, or server-side signed request before privileged operations.
- Keep requests idempotent by wallet address + chain ID or an explicit idempotency key.
- Validate `registryTxHash` on Base before trusting it.
- Keep A2A/debug ports local only.

## Files

- `src/server.ts` — service skeleton with `GET /healthz`, `POST /session/resolve`, and `POST /onboarding/start`.
- `package.json` — dependencies and scripts for local development.
- `.env.example` — safe placeholders only.
