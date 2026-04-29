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

## ETHSkills policy for Ethereum work

CounterAgent agents may use [ETHSkills](https://ethskills.com/) as task-specific Ethereum knowledge packs. Use them selectively: install only the skills needed for the current agent and task, then cite the relevant guidance in implementation notes or PR descriptions. Do not vendor the full catalog by default.

Recommended workflow:

```bash
# Preview the approved skills for an agent
node Agents/scripts/install-ethskills.mjs --agent A0-Orchestrator --dry-run

# Fetch the approved skills for an agent into Agents/.ethskills/
node Agents/scripts/install-ethskills.mjs --agent A0-Orchestrator

# Or fetch a narrow set for a specific issue
node Agents/scripts/install-ethskills.mjs --skills frontend-ux,wallets,l2s
```

`Agents/.ethskills/` is ignored by default so other builders can reproduce the setup without committing external docs. If a release intentionally vendors a skill snapshot, remove the ignore rule in that folder in the same PR and explain why.

Approved defaults live in `Agents/ethskills.manifest.json`:

- **A0-Orchestrator:** `wallets`, `l2s`, `standards`, `security`, `frontend-ux`, `tools`, `qa`
- **A1-Monitor:** `l2s`, `indexing`, `tools`, `standards`
- **A2-Decision:** `gas`, `l2s`, `building-blocks`
- **A3-Execution:** `wallets`, `l2s`, `building-blocks`, `security`, `gas`, `tools`
- **A4-Reporting:** `indexing`, `tools`, `standards`, `security`
