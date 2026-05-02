# ENS Integration

CounterAgent uses ENS as the merchant and agent discovery layer.

A merchant profile stores treasury preferences as ENS text records so the agent swarm can resolve configuration without a central database. A1 Monitor reads these records and passes the configuration to A0 Orchestrator, A2 Decision, A3 Execution, and A4 Reporting.

## Records

| ENS text record | Purpose |
| --- | --- |
| `counteragent.wallet` | Merchant wallet controlled by the user |
| `counteragent.fx_threshold_bps` | Minimum spread before conversion |
| `counteragent.risk_tolerance` | Conservative, moderate, or aggressive policy |
| `counteragent.preferred_stablecoin` | Preferred output stablecoin |
| `counteragent.telegram_chat_id` | Numeric Telegram chat id for A4 alerts |
| `counteragent.registry` | Merchant registry contract address |
| `counteragent.subnames` | Agent or service subnames for discovery |
| `counteragent.agent_mesh` | Compact JSON index of role-based agent ENS identities |
| `counteragent.agent_manifest_uri` | Optional IPFS/HTTPS pointer to the full agent identity manifest |

## Agent identity mesh

CounterAgent should not expose agents as `A0` through `A4` in ENS. The public names are role-based:

| ENS subname | Role | Service |
| --- | --- | --- |
| `orchestrator.counteragents.eth` | Treasury Orchestrator | `counteragent-orchestrator` |
| `monitor.counteragents.eth` | ENS Monitor | `counteragent-monitor` |
| `decision.counteragents.eth` | Risk Decision Engine | `counteragent-decision` |
| `execution.counteragents.eth` | Uniswap Execution Agent | `counteragent-execution` |
| `reporting.counteragents.eth` | Proof Reporting Agent | `counteragent-reporting` |

Each agent subname can publish:

| ENS text record | Purpose |
| --- | --- |
| `counteragent.agent.role` | Stable machine-readable role |
| `counteragent.agent.display` | Human-readable role name |
| `counteragent.agent.wallet` | Agent wallet address |
| `counteragent.agent.service` | Internal service name for OpenClaw/AXL routing |
| `counteragent.agent.endpoint` | Optional public endpoint pointer |
| `counteragent.agent.capabilities` | Comma-separated capability list |
| `counteragent.agent.protocols` | Protocols used by the agent |
| `counteragent.agent.profile` | Compact JSON profile for discovery clients |

This makes ENS the public registry for the agent mesh: name, wallet, capabilities, service routing, and proof pointers live together.

## Prepare agent records

Generate a local plan from environment variables:

```bash
ENS_PARENT_NAME=counteragents.eth \
A0_AGENT_WALLET_ADDRESS=0x... \
A1_AGENT_WALLET_ADDRESS=0x... \
A2_AGENT_WALLET_ADDRESS=0x... \
A3_AGENT_WALLET_ADDRESS=0x... \
A4_AGENT_WALLET_ADDRESS=0x... \
node ENS/prepare-agent-ens-records.mjs
```

Ask the A1 ENS plugin to return the full record set:

```bash
ENS_PLUGIN_URL=http://localhost:8788 node ENS/prepare-agent-ens-records.mjs
```

Private keys stay outside the app and repo. The script only prepares role-based ENS names and text records; on-chain writes should be performed by the authorized registrar/provisioner flow.

## Local check

Run the ENS-only smoke check:

```bash
bash ENS/test-ens-records-local.sh
```

Run the full local workflow gate:

```bash
bash Tests/test-counteragent-all.sh
```
