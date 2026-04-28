Agents:

- Orchestrator: Entry point and coordinator.
- A1-Monitor: Reads ENS config, watches balances and FX rates.
- A2-Decision: Hold or convert scoring logic.
- A3-Execution: Uniswap swap on Base via KeeperHub.
- A4-Reporting: 0G audit log and Telegram alerts.

Each agent folder includes a `.env.example` with the variables needed to run that agent.

Docker/OpenClaw deployment templates live in `Agents/openclaw/`.

Integration reference:

- Orchestrator integration guide — recommended App -> Orchestrator HTTPS flow and initial `POST /onboarding/start` contract. The guide lives inside the Orchestrator folder.
