# CounterAgent Uniswap Swap Execution Plugin

HTTP service for the A3 Execution agent.

Sponsor-visible OpenClaw plugin name: **Uniswap Swap Execution**.

This plugin demonstrates how CounterAgent uses the **Uniswap Trading API** as the quote/swap boundary while keeping live transaction submission gated for safety.

## Responsibility

A3 owns swap quote/execution. This is the agent that integrates with Uniswap.

The plugin defaults to `EXECUTION_MODE=dry-run`, so demos can exercise the full A0 -> A2 -> A3 -> A4 workflow without submitting transactions or moving funds. Even in dry-run mode, quote mode defaults to `UNISWAP_QUOTE_MODE=api-first`: if `UNISWAP_API_KEY` is configured, A3 attempts the Uniswap Trading API first and falls back only when the API/key/route/chain is unavailable.

## Architecture

```text
A0 Orchestrator
  -> A3 /execution/quote
      1. Try Uniswap Trading API /v1/quote
      2. If Base Sepolia has no API route, quote the seeded Uniswap v4 USDC/EURC pool
      3. If no pool quote is available, return CounterAgent oracle fallback quote
  -> A2 /decision/evaluate
  -> A3 /execution/execute when decision.action = CONVERT
      - dry-run: records execution event, no tx submitted
      - live wallet flow: use /execution/swap to build Trading API calldata for browser signing
  -> A4 Reporting
```

This is intentionally **API-first with honest fallback**. Base Sepolia support/liquidity in the Trading API may be incomplete, so fallback responses include `apiAttempted`, `apiStatus`, `apiError`, and `fallbackReason` for demo visibility and for `FEEDBACK.md`.

When `V4_QUOTER_84532` is configured, A3 tries the direct Uniswap v4 pool fallback before the oracle fallback. The pool setup scripts live in `../../../Uniswap` and target the Circle Base Sepolia USDC/EURC pair.

## Endpoints

```text
GET /healthz
GET /swap/recent?merchant=<address>
POST /execution/quote
POST /execution/swap
POST /execution/execute
POST /execution/confirm
```

### `POST /execution/quote`

Attempts Uniswap Trading API `/v1/quote` when `UNISWAP_API_KEY` is configured.

```bash
curl -X POST http://localhost:8791/execution/quote \
  -H 'content-type: application/json' \
  -d '{
    "workflowId": "demo-001",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "fromToken": "EURC",
    "toToken": "USDC",
    "amount": "100",
    "slippageBps": 50,
    "baselineRate": 1.0700
  }'
```

Fallback quote shape:

```json
{
  "provider": "uniswap-api-unavailable-fallback",
  "apiAttempted": true,
  "fallbackReason": "uniswap_trading_api_unsupported_or_no_route_chain_84532"
}
```

### `POST /execution/swap`

Builds a signable transaction via Uniswap Trading API `/v1/swap` from a previous API quote. This endpoint does **not** submit a server-side transaction; the browser/wallet should sign and send it.

```bash
curl -X POST http://localhost:8791/execution/swap \
  -H 'content-type: application/json' \
  -d '{
    "quote": { "...": "raw Uniswap quote object" },
    "signature": "0x"
  }'
```

### `POST /execution/execute`

Runs the A0/A2/A3 workflow execution step. In dry-run mode, it records the execution and returns `transactionHash: null`. If the Trading API cannot quote the selected chain/route, the execution status becomes `fallback-dry-run` and includes the fallback reason.

## Local setup

```bash
cd Agents/A3-Execution/Plugin-Uniswap-SwapExecution
cp .env.example .env
npm install
npm run build
npm start
```

## Environment

```text
PORT=8791
CORS_ORIGIN=https://counteragent.netlify.app
EXECUTION_MODE=dry-run
UNISWAP_QUOTE_MODE=api-first
CHAIN_ID=84532
UNISWAP_API_URL=https://trade-api.gateway.uniswap.org/v1
UNISWAP_API_KEY=<UNISWAP_API_KEY>
```

Optional token overrides let a different deployment use real testnet token addresses without changing code:

```text
USDC_TOKEN_ADDRESS_84532=0x036CbD53842c5426634e7929541eC2318f3dCF7e
EURC_TOKEN_ADDRESS_84532=0x808456652fdb597867f38412077A9182bf77359F
USDT_TOKEN_ADDRESS_84532=<USDT_ON_BASE_SEPOLIA>
```

For the seeded Base Sepolia fallback pool, also configure:

```text
V4_QUOTER_84532=0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba
V4_POOL_FEE=500
V4_TICK_SPACING=10
```

If no override is supplied, the plugin uses canonical Base mainnet stablecoin addresses for sponsor-visible defaults. For Base Sepolia, provide token overrides when using real test tokens.

## Quote modes

- `UNISWAP_QUOTE_MODE=api-first` — default. Try Trading API, then fallback.
- `UNISWAP_QUOTE_MODE=fallback-only` — never call Trading API; useful for local demos without an API key.

## Safety gates

- No API keys are committed; use `UNISWAP_API_KEY`.
- No server-side live transaction submission by default.
- `EXECUTION_MODE=dry-run` records quote/execution events for dashboard and reporting.
- `EXECUTION_MODE=vault-dry-run` resolves the merchant vault and prepares the `executeCall` envelope without submitting a transaction.
- `EXECUTION_MODE=vault-live` uses `EXECUTOR_PRIVATE_KEY` to call the merchant-owned vault `executeCall(...)` after policy checks; use only with reviewed router calldata and funded testnet vaults.
- `/execution/swap` returns calldata for wallet signing when using browser-wallet mode.

## Integration notes

The root `FEEDBACK.md` documents the Uniswap Trading API experience, including Base Sepolia gaps. Keep it updated whenever the API returns unsupported chain, no route, liquidity, simulation, or calldata issues.
