# CounterAgent Decision Scoring Plugin

HTTP service for the A2 Decision agent.

## Responsibility

A2 receives a market quote plus merchant policy and returns a deterministic treasury decision:

- `HOLD` when the net opportunity is below the merchant threshold.
- `CONVERT` when spread minus fees, price impact, and risk buffer meets the threshold.

A2 does **not** execute swaps and does **not** hold private keys.

## Endpoints

```text
GET /healthz
POST /decision/evaluate
```

## Local setup

```bash
cd Agents/A2-Decision/Plugin-CounterAgent-DecisionScoring
cp .env.example .env
npm install
npm run build
npm start
```

## Decision request

```bash
curl -X POST http://localhost:8790/decision/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "workflowId": "demo-001",
    "merchantEns": "demo.counteragent.eth",
    "merchantWallet": "0x0000000000000000000000000000000000000001",
    "fromToken": "EURC",
    "toToken": "USDC",
    "amount": "800",
    "fxThresholdBps": 50,
    "riskTolerance": "moderate",
    "quote": {
      "provider": "uniswap-dry-run",
      "rate": 1.0812,
      "baselineRate": 1.0700,
      "feeBps": 5,
      "priceImpactBps": 3
    }
  }'
```

## Pipeline position

```text
A1 Monitor / A3 Quote
  -> A2 Decision Plugin
  -> A3 Execution Plugin when decision.action = CONVERT
```

## Security rules

- No private keys.
- No direct swaps.
- Treat quotes as untrusted input unless they come from a trusted A3 endpoint.
- Keep the scoring contract stable so A0 can audit decisions.
