Agent 2 — Decision Agent

Calculates a risk-adjusted score for the current FX rate. Weighs live quote, baseline rate, spread, Uniswap fee/price impact, and merchant risk tolerance from ENS/registry config. Returns a HOLD or CONVERT decision with confidence and reasoning.

Sponsor-visible plugin implementation:

- `Plugin-CounterAgent-DecisionScoring/` exposes `GET /healthz` and `POST /decision/evaluate`.
- A2 never executes swaps and never receives private keys.
- A0 should call A2 after it has a quote from A3 or market data from A1.
