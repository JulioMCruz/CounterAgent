Agent 3 — Execution Agent

Owns swap quote and execution. This is the agent that works with Uniswap for quotes/swaps and later KeeperHub for gas, MEV protection, nonce management, and retry.

Sponsor-visible plugin implementation:

- `Plugin-Uniswap-SwapExecution/` exposes `GET /healthz`, `POST /execution/quote`, `POST /execution/execute`, and `POST /execution/confirm`.
- Default mode is `EXECUTION_MODE=dry-run`, so the workflow can be tested without submitting transactions.
- Live execution remains gated until Uniswap/KeeperHub adapters and executor custody are reviewed.
