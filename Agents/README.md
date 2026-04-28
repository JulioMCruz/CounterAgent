Agents:

- A0-Orchestrator: Entry point and coordinator.
- A1-Monitor: Reads ENS config, watches balances and FX rates.
- A2-Decision: Hold or convert scoring logic.
- A3-Execution: Uniswap swap on Base via KeeperHub.
- A4-Reporting: 0G audit log and Telegram alerts.
