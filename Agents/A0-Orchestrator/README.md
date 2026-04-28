Agent 0 — Orchestrator

Entry point and coordinator. Initialises the pipeline, passes context between agents, manages failure and recovery paths. The merchant interacts only here. All agents report back to the Orchestrator. Sends Telegram alerts to the merchant on critical halts and anomalies.

The Orchestrator is also the public app-facing agent. The App should call the Orchestrator over HTTPS for onboarding and orchestration requests. See `app-orchestrator-integration.md` for the recommended endpoint contract and security model.

Plugin/service reference lives in `Plugin-CounterAgent/`. It contains the App-facing `POST /onboarding/start` skeleton for the Orchestrator integration.
