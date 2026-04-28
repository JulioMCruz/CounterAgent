# CounterAgent 🦩

> **Autonomous stablecoin treasury management for merchants on Base. No backend. No manual intervention. No value lost to bad FX timing.**

[![ETHGlobal](https://img.shields.io/badge/ETHGlobal-Open%20Agents%202026-blue)](https://ethglobal.com/events/openagents)
[![Base](https://img.shields.io/badge/Network-Base-0052FF)](https://base.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

Merchants accepting crypto payments leak value every day to poor FX timing:

- Converting EURC → USDC manually means watching rates, calculating fees, and still getting it wrong
- No existing tool monitors FX spreads continuously and acts autonomously
- Every solution requires a centralised server — one point of failure, one point of trust
- Automated responses execute without consensus — wrong actions cost real money
- In 2024–2025, merchants lost significant value simply by converting at the wrong moment

---

## The Solution

CounterAgent is a 5-agent autonomous system that watches your wallet, scores live FX rates, and converts stablecoins at the optimal moment via Uniswap v3 — with KeeperHub guaranteeing execution and **x402 micropayments settling every inter-agent step on-chain**. You get a Telegram alert when it happens.

1. **Agent 0 (Orchestrator)** — coordinates all agents, owns failure and recovery decisions
2. **Agent 1 (Monitor)** — reads ENS config, watches wallet balances and Uniswap pool rates in real time
3. **Agent 2 (Decision)** — runs hold/convert scoring logic weighted by FX spread, fee, and risk tolerance
4. **Agent 3 (Execution)** — submits swaps via Uniswap v3 on Base; KeeperHub MCP handles gas, MEV protection, retries; x402 handles inter-agent payment settlement
5. **Agent 4 (Reporting)** — logs every decision to 0G Storage; sends Telegram alert to merchant

---

## Architecture

![CounterAgent Architecture](./assets/architecture.svg)

All agents are **bidirectional** — failures propagate back through the pipeline (Execution → Decision → Orchestrator) rather than silently dropping.

Every inter-agent step settles via **x402 micropayments on Base** — agents pay each other on-chain, making the entire pipeline verifiably trustless with no off-chain coordination.

---

## Partner Integrations

### x402 — Inter-Agent Payment Settlement
Each agent-to-agent handoff in the pipeline is settled via x402 micropayments on Base. When Agent 2 signals Agent 3 to execute, that instruction carries an on-chain payment — no off-chain trust required. The full pipeline is economically self-contained and auditable end-to-end.

### ENS — Decentralised Config Store
Each merchant stores treasury configuration in ENS text records — one setup step, fully self-custodial, no centralised database:

| ENS Text Record | Value |
|---|---|
| `counteragent.fx_threshold` | `0.005` (0.5%) |
| `counteragent.risk_tolerance` | `moderate` |
| `counteragent.preferred_stablecoin` | `USDC` |
| `counteragent.telegram_chat_id` | `@merchantchat` |

Config is readable at runtime by Agent 1 — merchants update settings without touching any app.

### Uniswap v3 — Swap Execution
Agent 3 executes swaps across Base liquidity pools:

| Pair | Pool |
|---|---|
| EURC → USDC | Uniswap v3 Base |
| USDT → USDC | Uniswap v3 Base |
| USDC → EURC | Uniswap v3 Base |

### KeeperHub — Execution Reliability
KeeperHub MCP server handles:
- Gas estimation and nonce management
- MEV protection
- Retry logic with exponential backoff
- Guaranteed delivery on Base

### 0G Storage — Immutable Audit Log
Every consensus round writes to 0G:
- Proposal data (FX rate, spread, tx hash)
- Agent decision (HOLD / CONVERT + reasoning)
- Execution result (swap hash, rate achieved, fee paid)
- Final outcome with timestamps

Verifiable on [storagescan.0g.ai](https://storagescan.0g.ai)

### Telegram Bot API — Merchant Alerts
Merchants receive real-time notifications:

| Trigger | Alert |
|---|---|
| ✅ Swap executed | Amount, rate achieved, fee saved vs card rails |
| ⏸ Hold decision | Rate below threshold, monitoring continues |
| 📊 FX approaching threshold | Heads-up before action |
| ⚠️ Anomaly detected | Execution paused, review required |
| 🛑 Critical halt | Agent 0 emergency stop |

---

## How It Works — Step by Step

1. Merchant wallet receives USDC, EURC, or USDT on Base
2. Agent 1 reads ENS text records for merchant config
3. Agent 1 polls Uniswap v3 pool rates continuously
4. When spread exceeds threshold → signal sent to Agent 2
5. Agent 2 scores: FX rate × swap fee × risk tolerance → HOLD or CONVERT
6. If CONVERT → Agent 3 submits swap via Uniswap v3
7. KeeperHub MCP guarantees delivery with MEV protection + retry
8. Agent 4 writes decision + result to 0G Storage
9. Agent 4 fires Telegram alert to merchant
10. Completion reported back to Orchestrator (Agent 0)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | Claude Agent SDK (Anthropic) |
| AI Models | Claude Sonnet 4.6 |
| Network | Base (Ethereum L2) |
| Inter-Agent Payments | x402 micropayments (on-chain settlement) |
| Swap Execution | Uniswap v3 |
| Execution Reliability | KeeperHub MCP |
| Config Store | ENS Text Records (on-chain) |
| Audit Log | 0G Storage |
| Merchant Alerts | Telegram Bot API |
| Frontend | React + TypeScript + Vite |
| Stablecoins | USDC · EURC · USDT |

---

## Supported Stablecoins

CounterAgent operates on Base with:

| Token | Issuer | Peg |
|---|---|---|
| USDC | Circle | US Dollar |
| EURC | Circle | Euro |
| USDT | Tether | US Dollar |

> **Why we originally chose Celo:** Celo's Mento protocol offers regional stablecoins (cUSD, cEUR, cREAL, cKES, cCOP, cGHS, eXOF, PUSO) which would have made CounterAgent a truly global multi-currency treasury tool. We pivoted to Base when KeeperHub — a core execution sponsor — confirmed they do not support Celo. Regional stablecoin expansion is on the roadmap.

---

## Telegram Alerts

Merchants store their Telegram chat ID in their ENS text record (`counteragent.telegram_chat_id`). Zero extra setup. Example alert:

```
✅ CounterAgent executed swap
800 EURC → USDC @ 1.0812
Saved $4.20 vs Stripe FX
Fee: 0.05% | Logged to 0G
```

---

## Mobile UI

CounterAgent is mobile-first — the natural entry point is the Telegram notification on your phone.

**Color palette:** Flamingo `#FF5CB9` (primary) · Citrus `#FF9700` (accent) · Charcoal `#231F20` (text)

<p align="center">
  <a href="https://candid-fairy-ac610c.netlify.app/">
    <img src="./assets/screen-landing.svg" width="30%" alt="Landing screen" />
  </a>
  &nbsp;
  <a href="https://candid-fairy-ac610c.netlify.app/">
    <img src="./assets/screen-dashboard.svg" width="30%" alt="Dashboard screen" />
  </a>
  &nbsp;
  <a href="https://candid-fairy-ac610c.netlify.app/">
    <img src="./assets/screen-analytics.svg" width="30%" alt="Analytics screen" />
  </a>
</p>

<p align="center">
  <a href="https://candid-fairy-ac610c.netlify.app/"><strong>📱 View all 6 screens — Live Mockup →</strong></a>
</p>

**6 screens:** Landing · Dashboard · Onboarding · Analytics · Alerts · Settings

| Screen | Description |
|---|---|
| Landing | Hero, CTA, sponsor badges, feature cards |
| Dashboard | Balance hero card, token holdings, savings, agent activity log |
| Onboarding | Step progress, ENS input, FX slider, risk selector, Telegram ID, stablecoin picker |
| Analytics | Savings chart, stats grid, pair breakdown by volume |
| Alerts | Telegram status banner, filtered alert feed with severity badges |
| Settings | Wallet card, treasury config, notification toggles, integration status |

---

## Quick Start

```bash
git clone https://github.com/JulioMCruz/CounterAgent
cd CounterAgent
npm install
cp .env.example .env
# Add API keys: Anthropic, KeeperHub, Telegram Bot, 0G
npm run dev
```

### Environment Variables

```env
ANTHROPIC_API_KEY=
KEEPERHUB_API_KEY=
TELEGRAM_BOT_TOKEN=
ZERO_G_API_KEY=
BASE_RPC_URL=
```

---

## Prizes Targeting

| Sponsor | Prize | Integration |
|---|---|---|
| Uniswap Foundation | $5,000 | Swap execution via Uniswap v3 on Base |
| KeeperHub | $5,000 | Execution reliability MCP layer |
| Gensyn | $5,000 | Decentralised ML compute for Decision Agent scoring model |
| ENS | — | On-chain merchant config via text records |
| 0G Labs | — | Immutable decentralised audit log |

---

## Team

Built at **ETHGlobal Open Agents 2026** — April 24 to May 3, 2026

| Name | Role | Contact |
|---|---|---|
| Abena | Product & Research | [@abena_eth](https://twitter.com/abena_eth) · abena@bluewin.ch |
| Julio M Cruz | Engineering | [GitHub: JulioMCruz](https://github.com/JulioMCruz) |

---

## Contact

- Twitter/X: [@abena_eth](https://twitter.com/abena_eth)
- GitHub: [JulioMCruz/CounterAgent](https://github.com/JulioMCruz/CounterAgent)
- ETHGlobal: [Open Agents 2026](https://ethglobal.com/events/openagents)
