# CounterAgent Gensyn AXL Agent Messaging Plugin

Sponsor-visible OpenClaw plugin name: **Gensyn AXL Agent Messaging**.

This plugin aligns CounterAgent with Gensyn's Agent eXchange Layer (AXL): encrypted, decentralized peer-to-peer communication for agents.

## Current role

During dry-run workflow testing this plugin provides an AXL-compatible messaging adapter and local HTTP fallback. It records/relays structured agent messages without replacing the working A0 HTTP orchestration path yet.

## Endpoints

```text
GET /healthz
POST /axl/messages
GET /axl/messages/:workflowId
```

## Message envelope

```json
{
  "workflowId": "demo-001",
  "fromAgent": "A0-Orchestrator",
  "toAgent": "A3-Uniswap-SwapExecution",
  "messageType": "quote-request",
  "payload": {
    "fromToken": "EURC",
    "toToken": "USDC"
  }
}
```

## Future AXL integration

When separate Gensyn AXL nodes are configured, this adapter should forward messages to the local AXL node instead of only storing the envelope locally. The public Orchestrator workflow can keep the same business logic while the transport moves from direct HTTP to AXL-mediated agent messaging.

## Qualification note

Do not claim full Gensyn prize qualification until a demo shows communication across separate AXL nodes. This plugin is the integration boundary and migration path.
