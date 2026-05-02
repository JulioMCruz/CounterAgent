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

## Local check

Run the ENS-only smoke check:

```bash
bash ENS/test-ens-records-local.sh
```

Run the full local workflow gate:

```bash
bash Tests/test-counteragent-all.sh
```
