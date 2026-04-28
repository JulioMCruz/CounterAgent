Agent 2 — Decision Agent

Calculates a risk-adjusted score for the current FX rate. Weighs four inputs: live exchange rate vs baseline (e.g. 11:00 UTC), spread percentage, off-ramp fee (Uniswap), and merchant risk tolerance (from ENS). Returns a HOLD or CONVERT decision with confidence and reasoning. Receives live conditions from Monitor, executes via Execution Agent, reports outcome back to Orchestrator. Can override active decisions if conditions shift during execution.
