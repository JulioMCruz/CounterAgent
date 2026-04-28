# App to Orchestrator Integration

## Recommended approach

The App should call the Orchestrator through a public HTTPS API exposed by the Orchestrator.

The Orchestrator is the app-facing orchestrator. The App should not expose an endpoint for the Orchestrator to poll as the primary flow. Polling from the Orchestrator makes the architecture more fragile, requires public App callbacks, and complicates auth, retries, and event ordering.

Preferred flow:

```text
User -> App -> Orchestrator HTTPS endpoint -> Orchestrator orchestration -> A1/A2/A3/A4
```

The Orchestrator should expose a small service API using an OpenClaw plugin or sidecar service running with the Orchestrator.

Public URL:

```text
https://orchestrator.counteragent.perkos.xyz
```

App environment variable:

```env
NEXT_PUBLIC_ORCHESTRATOR_URL=https://orchestrator.counteragent.perkos.xyz
```

## Why the Orchestrator should expose the endpoint

- The Orchestrator owns onboarding orchestration.
- The App remains a client/UI, not an agent runtime.
- ThirdWeb remains wallet and contract interaction infrastructure, not an agent.
- The Orchestrator can validate requests, coordinate ENS setup, call or monitor registry actions, and hand off verified config to Monitor.
- Retries, idempotency, logs, and agent-to-agent handoff stay server-side.
- The App only needs to send intent and wallet/session context.

## Initial endpoint contract

### `POST /onboarding/start`

Starts or resumes merchant onboarding.

Request body:

```json
{
  "walletAddress": "0x...",
  "chainId": 8453,
  "merchantName": "Example Merchant",
  "ensName": "merchant.counteragent.eth",
  "telegramChat": "optional",
  "registryTxHash": "optional",
  "callbackUrl": "optional"
}
```

Recommended response:

```json
{
  "ok": true,
  "onboardingId": "...",
  "status": "accepted",
  "next": "verify-registry"
}
```

## Orchestrator responsibilities

The Orchestrator should:

1. Accept onboarding requests from the App.
2. Validate wallet address, chain ID, and required metadata.
3. Check or coordinate `MerchantRegistry` state.
4. Provision or update ENS text records when supported.
5. Verify ENS/config consistency.
6. Persist onboarding state and idempotency keys.
7. Notify or hand off runtime config to Monitor.
8. Return clear status to the App.

## App responsibilities

The App should:

1. Connect wallet via ThirdWeb.
2. Register or request registration in `MerchantRegistry`.
3. Call the Orchestrator after the user submits onboarding data.
4. Show the Orchestrator onboarding status to the user.
5. Never store private keys or agent secrets.

## Plugin vs sidecar

Best hackathon path: implement a small Orchestrator HTTPS plugin/sidecar first.

- Short term: simple Express/Fastify service inside the Orchestrator container or alongside it.
- Medium term: convert it into a formal OpenClaw plugin if deeper runtime integration is needed.

The public contract should remain stable either way:

```text
POST https://orchestrator.counteragent.perkos.xyz/onboarding/start
```

## Security requirements

- HTTPS only.
- No OpenClaw tokens in the browser.
- Use a server-side API key, signed payload, wallet signature, or SIWE-style verification for privileged operations.
- Make onboarding idempotent using wallet address plus chain ID, or an explicit idempotency key.
- Validate `registryTxHash` against Base before trusting it.
- Keep A2A/debug ports local only.

## Not recommended as primary flow

```text
Orchestrator polling App endpoint
```

Use App callbacks only for optional async notifications, not as the main integration path.
