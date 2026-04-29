# CounterAgent Uniswap Swap Execution Plugin

HTTP service for the A3 Execution agent.

Sponsor-visible OpenClaw plugin name: **Uniswap Swap Execution**.

This plugin demonstrates how CounterAgent uses the Uniswap Trading API as the swap quote/execution boundary while keeping live transaction submission gated for safety.

## Responsibility

A3 owns swap quote/execution. This is the agent that integrates with Uniswap.

The plugin defaults to `EXECUTION_MODE=dry-run`, so demos can exercise the full A0 -> A2 -> A3 -> A4 workflow without submitting transactions or moving funds.

## Endpoints

```text
GET /healthz
POST /execution/quote
POST /execution/execute
POST /execution/confirm
```

## Local setup

```bash
cd Agents/A3-Execution/Plugin-Uniswap-SwapExecution
cp .env.example .env
npm install
npm run build
npm start
```

## Quote request

```bash
curl -X POST http://localhost:8791/execution/quote \
  -H 'content-type: application/json' \
  -d '{
    "workflowId": "demo-001",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "fromToken": "EURC",
    "toToken": "USDC",
    "amount": "800",
    "slippageBps": 50,
    "baselineRate": 1.0700
  }'
```

## Execute request

```bash
curl -X POST http://localhost:8791/execution/execute \
  -H 'content-type: application/json' \
  -d '{
    "workflowId": "demo-001",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "fromToken": "EURC",
    "toToken": "USDC",
    "amount": "800",
    "decision": {
      "action": "CONVERT",
      "confidence": 92
    }
  }'
```

In dry-run mode the response includes a quote and `transactionHash: null`.

## Live execution gates

Live execution is intentionally gated. Before enabling real swaps, review and wire:

- Uniswap Trading API quote/swap adapter.
- KeeperHub gas/MEV/retry adapter.
- Executor wallet custody and funding.
- Allowlist for token pairs and chain ID.
- Strict idempotency for each workflow.

## Pipeline position

```text
A0 Orchestrator
  -> A3 /execution/quote
  -> A2 /decision/evaluate
  -> A3 /execution/execute when decision.action = CONVERT
  -> A4 Reporting
```
