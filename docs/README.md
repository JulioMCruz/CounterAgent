# CounterAgent Documentation

This folder contains judge-facing architecture and implementation notes.

## Key areas

- `autopilot-vault.md` explains the merchant-owned vault model and deployed testnet contract surface.
- `../Contracts/deployments/` contains machine-readable testnet deployment metadata.
- `../ENS/` documents how ENS stores merchant configuration and agent discovery records.
- `../Gensyn/` contains AXL transport checks and evidence scripts.
- `../Uniswap/` contains Uniswap-specific tooling and integration material.
- `../tests/` contains local gates for contracts, agents, AXL transport, ENS, Uniswap, reporting, and Telegram alerts.

## Recommended local gate

```bash
bash tests/test-counteragent-all.sh
```
