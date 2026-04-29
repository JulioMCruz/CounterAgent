# CounterAgent ENS Merchant Config Plugin

HTTP service for the ENS/Monitor agent.

Sponsor-visible OpenClaw plugin name: **ENS Merchant Config**.

This plugin demonstrates ENS as the decentralized merchant configuration layer for CounterAgent.

## Responsibilities

- Provision merchant ENS subnames through `CounterAgentENSRegistrar`.
- Read CounterAgent ENS text records from Ethereum Sepolia.
- Keep ENS-specific logic out of the App and Orchestrator.

## Endpoints

```text
GET /healthz
POST /ens/provision
GET /ens/config/:name
```

## Setup

```bash
cd Agents/A1-Monitor/Plugin-ENS-MerchantConfig
cp .env.example .env
npm install
npm run build
npm start
```

Never expose the provisioner private key to the browser. This service must run server-side.

## Provision subname

```bash
curl -X POST http://localhost:8788/ens/provision \
  -H 'content-type: application/json' \
  -d '{
    "label": "merchant-demo",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "fxThresholdBps": 50,
    "riskTolerance": "moderate",
    "preferredStablecoin": "USDC",
    "telegramChatId": "@merchant",
    "registryAddress": "0xd532D7C9Ddc28d16601FaA5Cc6F54cDABb703C28"
  }'
```

## Read config

```bash
curl http://localhost:8788/ens/config/merchant-demo.counteragent.eth
```

## Runtime model

```text
App -> Orchestrator -> Monitor Plugin -> CounterAgentENSRegistrar -> ENS
```

The registrar owner controls upgrades/admin. The Monitor plugin should use a provisioner wallet that has been explicitly allowed by the registrar owner.
