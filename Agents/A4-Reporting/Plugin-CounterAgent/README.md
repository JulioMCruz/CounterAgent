# CounterAgent Reporting Plugin

HTTP service for the A4 Reporting agent.

## Responsibilities

- Receive execution/decision outcomes from A0 or A3.
- Build a canonical report artifact.
- Publish the artifact to the configured storage backend.
- Return a report id, content hash, and storage URI.

0G Storage integration belongs here because A4 owns reporting and audit trails.

## Endpoints

```text
GET /healthz
POST /reports/publish
GET /reports/:id
```

## Setup

```bash
cd Agents/A4-Reporting/Plugin-CounterAgent
cp .env.example .env
npm install
npm run build
npm start
```

## Storage modes

### Local mode

Local mode is the default development fallback. It writes canonical JSON report files to `REPORT_STORAGE_DIR` and returns a SHA-256 content hash.

```text
REPORT_STORAGE_MODE=local
REPORT_STORAGE_DIR=./data/reports
```

### 0G mode

0G mode uses the official 0G Foundation TypeScript SDK. It requires a funded A4 wallet and an active 0G Storage indexer RPC URL.

```text
REPORT_STORAGE_MODE=0g
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_CHAIN_ID=16602
ZERO_G_INDEXER_RPC_URL=https://indexer-storage-testnet-turbo.0g.ai
A4_REPORTING_PRIVATE_KEY=<PRIVATE_KEY_SERVER_SIDE_ONLY>
```

The A4 wallet needs 0G Galileo testnet tokens. The App must never receive the A4 private key.

The plugin returns both a local SHA-256 content hash of the canonical report and the 0G root hash/transaction hash returned by the SDK.

## Publish report

```bash
curl -X POST http://localhost:8789/reports/publish \
  -H 'content-type: application/json' \
  -d '{
    "merchantEns": "demo.counteragents.eth",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "decision": "convert",
    "summary": "Converted incoming USDC treasury balance according to merchant policy.",
    "fxRate": "1.0000",
    "transactionHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "savingsEstimateUsd": "12.34"
  }'
```

## Architecture

```text
A0 Orchestrator / A3 Execution
  -> A4 Reporting Plugin
  -> 0G Storage or local development storage
```

The returned `contentHash` can later be mirrored into ENS as a public pointer, for example:

```text
counteragent.latest_report
```
