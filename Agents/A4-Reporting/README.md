Agent 4 — Reporting Agent

Receives the execution outcome from Agent 3. Generates the savings summary — amount converted, rate achieved, fee paid, saving versus card processing equivalent. Logs every decision permanently to 0G Storage, giving the merchant a verifiable on-chain audit trail. Sends a Telegram alert to the merchant with the outcome. Flags anomalies back to the Orchestrator before publishing.

## ETHSkills for A4

Use ETHSkills when changing onchain audit trails, event reads, reporting proofs, or storage/indexing assumptions:

```bash
node ../scripts/install-ethskills.mjs --agent A4-Reporting
```

Relevant defaults: `indexing`, `tools`, `standards`, `security`.
