Agent 3 — Execution Agent

Executes the swap via the Uniswap API across the deepest stablecoin pools — USDC ↔ USDT ↔ DAI. KeeperHub wraps every transaction with retry logic, MEV protection, and guaranteed delivery. On success, passes the outcome directly to the Reporting Agent. On failure, reports back to the Decision Agent for recalculation.
