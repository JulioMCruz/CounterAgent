# Uniswap API Feedback — CounterAgent

CounterAgent integrates Uniswap through the **Uniswap Trading API** in the A3 Execution plugin:

- Plugin: `Agents/A3-Execution/Plugin-Uniswap-SwapExecution/`
- Quote endpoint used: `POST https://trade-api.gateway.uniswap.org/v1/quote`
- Swap build endpoint used: `POST https://trade-api.gateway.uniswap.org/v1/swap`
- Header: `x-api-key: <UNISWAP_API_KEY>`
- Universal Router header: `x-universal-router-version: 2.0`

## What worked well

- The Trading API gives a clean sponsor-visible integration point for the execution agent: A3 can request a route/quote without embedding routing logic in our app.
- The quote request shape maps naturally to CounterAgent workflow fields:
  - merchant wallet -> `swapper`
  - user amount -> `amount` after decimals conversion
  - selected stablecoins -> `tokenIn` / `tokenOut`
  - target chain -> `tokenInChainId` / `tokenOutChainId`
- The API boundary keeps the app safer: `/execution/swap` can return wallet-signable calldata while server-side custody remains disabled.

## Gaps / issues found

### Base Sepolia support is the main uncertainty

CounterAgent's merchant onboarding and registry demo run on **Base Sepolia** (`84532`). The Trading API appears optimized for mainnet and mature testnets; Base Sepolia route coverage and stablecoin liquidity are uncertain.

For a merchant treasury demo, this matters because the user flow should not depend on a hidden hardcoded quote. Our implementation is therefore API-first:

1. Try Uniswap Trading API `/v1/quote` for the actual user-selected amount/tokens/merchant.
2. If the API returns unsupported chain, no route, 404, liquidity, simulation, or other errors, return a clearly labeled fallback quote:
   - `provider: "uniswap-api-unavailable-fallback"`
   - `apiAttempted: true`
   - `apiStatus`
   - `apiError`
   - `fallbackReason`
3. The dashboard/reporting layer can show that Uniswap API was attempted and why a fallback was used.

This makes the gap visible instead of hiding it.

### Testnet stablecoin addresses need clearer guidance

The docs are strong for common production chains, but hackathon teams working on Base Sepolia need a quick answer to:

- Which token addresses are supported by the Trading API on Base Sepolia?
- Which pools/routes have enough liquidity for realistic demos?
- Whether EURC/USDC is expected to work on Base Sepolia.

We added env overrides (`USDC_TOKEN_ADDRESS_84532`, `EURC_TOKEN_ADDRESS_84532`, `USDT_TOKEN_ADDRESS_84532`) so deployments can use real test tokens without changing plugin code.

### Swap execution should stay wallet-owned

For this use case, merchants should sign transactions with their own wallet. The API's `/swap` endpoint is useful because it can build calldata for the Universal Router, but the app should avoid server-side private-key custody. Our A3 plugin exposes `/execution/swap` for transaction build and keeps direct server submission gated.

## Recommendation for Uniswap docs/API

For hackathon builders, it would help to have:

1. A testnet support matrix for Trading API by chain and protocol version.
2. Known-good token pairs/routes per testnet.
3. A Base Sepolia example with token addresses, quote request, swap request, and expected limitations.
4. Error codes that distinguish unsupported chain vs. no route vs. insufficient liquidity vs. simulation failure.

## Current CounterAgent behavior

- `UNISWAP_QUOTE_MODE=api-first` by default.
- `EXECUTION_MODE=dry-run` by default.
- No hardcoded pair rates: fallback quotes use the user/oracle supplied `dryRunRate` or `baselineRate`; otherwise they explicitly fall back to neutral `1` with `fallbackReason: "no_market_rate_available"`.
- Real calldata build is isolated in `POST /execution/swap` and requires a successful Uniswap API quote plus wallet-side signing.

## Observed API result

After configuring a real `UNISWAP_API_KEY`, CounterAgent successfully reached the Trading API from A3.

Base Sepolia quote attempt:

```json
{
  "tokenInChainId": 84532,
  "tokenOutChainId": 84532,
  "type": "EXACT_INPUT",
  "fromToken": "EURC",
  "toToken": "USDC",
  "amount": "100"
}
```

Observed response after fixing request schema (`slippageTolerance` cannot be combined with `autoSlippage`):

```json
{
  "apiAttempted": true,
  "apiStatus": 404,
  "fallbackReason": "uniswap_trading_api_unsupported_or_no_route_chain_84532",
  "apiError": "ResourceNotFound: No quotes available"
}
```

Conclusion: the API key and API call path work, but this Base Sepolia EURC/USDC route currently has no Trading API quote available. CounterAgent therefore uses the documented fallback quote and records the API gap visibly.
