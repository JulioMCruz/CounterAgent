Agent 0 — Orchestrator

Entry point and coordinator. Initialises the pipeline, passes context between agents, manages failure and recovery paths. The merchant interacts only here. All agents report back to the Orchestrator. Sends Telegram alerts to the merchant on critical halts and anomalies.
