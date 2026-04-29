Agent 1 — Monitor Agent _(ENS)_

Reads the merchant's treasury configuration from their ENS text records — FX threshold, risk tolerance, preferred rails, and Telegram chat ID. Monitors wallet balance, live FX rates, and off-ramp fees continuously. Signals the Decision Agent when trigger conditions are met. Optionally sends a Telegram heads-up when FX rate is approaching the merchant's threshold. If conditions change mid-execution, can override in-flight decisions.


Sponsor-visible plugin implementation:

- `Plugin-ENS-MerchantConfig/` exposes `GET /healthz`, `POST /ens/provision`, and `GET /ens/config/:name`.
- The plugin provisions ENS subnames and reads CounterAgent ENS text records for merchant configuration.

## ETHSkills for A1

Use ETHSkills only when changing chain reads, ENS/registry reads, indexing, or monitoring logic:

```bash
node ../scripts/install-ethskills.mjs --agent A1-Monitor
```

Relevant defaults: `l2s`, `indexing`, `tools`, `standards`.
