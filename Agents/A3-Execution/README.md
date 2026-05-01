Agent 3 — Execution Agent

Owns swap quote and execution. This is the agent that works with Uniswap for quotes/swaps and later KeeperHub for gas, MEV protection, nonce management, and retry.

Sponsor-visible plugin implementation:

- `Plugin-Uniswap-SwapExecution/` exposes `GET /healthz`, `GET /swap/recent`, `POST /execution/quote`, `POST /execution/swap`, `POST /execution/execute`, and `POST /execution/confirm`.
- Quote flow is `UNISWAP_QUOTE_MODE=api-first`: call Uniswap Trading API first, then fall back with explicit metadata if the API/key/chain/route is unavailable.
- Default mode is `EXECUTION_MODE=dry-run`, so the workflow can be tested without submitting transactions.
- Browser-signed live swap flow should use `/execution/swap` to build Uniswap Trading API calldata; server-side custody remains gated until reviewed.
- Keep root `FEEDBACK.md` updated with Uniswap Trading API findings, especially Base Sepolia support gaps.

## ETHSkills for A3

Use ETHSkills before changing swap quote/execution, wallet custody, relayer flow, gas, or Uniswap integration:

```bash
node ../scripts/install-ethskills.mjs --agent A3-Execution
```

Relevant defaults: `wallets`, `l2s`, `building-blocks`, `security`, `gas`, `tools`.
