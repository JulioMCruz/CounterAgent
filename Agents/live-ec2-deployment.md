# Live EC2 Agent Deployment Notes

This document captures the live A0-A4 deployment requirements that must be preserved when replacing EC2 agent nodes. Do not commit private keys, AWS credentials, or raw user-data with secrets.

## Public agent endpoints

| Role | Agent | HTTP endpoint | AXL service |
| --- | --- | --- | --- |
| A0 | Orchestrator | `http://52.200.130.200` | local router |
| A1 | ENS Monitor | `http://18.234.193.184` | `counteragent-monitor` |
| A2 | Decision | `http://54.166.11.128` | `counteragent-decision` |
| A3 | Execution | `http://34.226.160.114` | `counteragent-execution` |
| A4 | Reporting | `http://107.23.81.60` | `counteragent-reporting` |

Netlify production currently proxies `/api/a0/*` to A0 via `NEXT_PUBLIC_A0_URL=http://52.200.130.200`.

## Required live configuration

### A0 Orchestrator

A0 must have all workflow agent URLs and AXL peer IDs configured, plus the registry relayer key.

Required env:

```env
PORT=8787
BASE_RPC_URL=https://sepolia.base.org
DEFAULT_CHAIN_ID=84532
ENS_PARENT_NAME=counteragents.eth
MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D
REGISTRY_RELAYER_PRIVATE_KEY=<from local secret store; never commit>
MONITOR_AGENT_URL=http://18.234.193.184
DECISION_AGENT_URL=http://54.166.11.128
EXECUTION_AGENT_URL=http://34.226.160.114
REPORTING_AGENT_URL=http://107.23.81.60
GENSYN_AXL_MODE=transport
GENSYN_AXL_FALLBACK_HTTP=false
GENSYN_AXL_NODE_URL=http://127.0.0.1:8890
GENSYN_AXL_PEER_A1=87c3ecafcc3fe0a707ca941df307f888d44551f1186d63b5075399fef061d5fb
GENSYN_AXL_PEER_A2=5ac8083de65af82381c2a26ba68ff53a454ce6464dc09f83f2bdb9c91c77a836
GENSYN_AXL_PEER_A3=f193064938e9a64e86894bf8bed75fedb7ba285b569a070ca72949368e5d6cbd
GENSYN_AXL_PEER_A4=161f75861439c89892f66e457b12011fd3a283147d3cd503ce5eedfc8775ba92
GENSYN_AXL_SERVICE_A1=counteragent-monitor
GENSYN_AXL_SERVICE_A2=counteragent-decision
GENSYN_AXL_SERVICE_A3=counteragent-execution
GENSYN_AXL_SERVICE_A4=counteragent-reporting
```

Health check must show `registryRelayerConfigured: true`.

### A1 ENS Monitor

A1 must have ENS registrar/provisioner configuration or `lookup_merchant_config` returns JSON-RPC errors instead of structured merchant lookup results.

Required env:

```env
PORT=8788
ENS_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ENS_REGISTRY_ADDRESS=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
ENS_PUBLIC_RESOLVER_ADDRESS=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
ENS_REGISTRAR_ADDRESS=0x1e25Aac761220e991DD65f8Cd74045007AbAa445
ENS_PARENT_NAME=counteragents.eth
MERCHANT_REGISTRY_ADDRESS=0x9857d987F57607b1e6431Ab94D26a866870b7a3D
A1_ENS_MONITOR_PRIVATE_KEY=<from local secret store; never commit>
```

Expected unknown-merchant response over MCP is a successful JSON-RPC result whose text content contains `{"ok":false,"error":"ens_merchant_not_found"...}`. It should not be a JSON-RPC `merchant_lookup_failed` error.

### A4 Reporting

A4 must run an image that includes `POST /mcp`; older images only exposed `/reports/publish` and cause A0 `publish_report` MCP failures.

Required env:

```env
PORT=8789
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_ALERTS_URL=<optional alert plugin URL>
```

Health check must include:

```json
{"mcp":{"service":"counteragent-reporting","tools":["publish_report"]}}
```

### A3 Execution / Uniswap

A3 must have the Uniswap Trading API key loaded from the local secret store before restart. The source secret lives outside git at `~/.openclaw/secrets/counteragent-uniswap.env` and currently provides `UNISWAP_API_KEY`; never paste or commit the value.

Required env:

```env
PORT=8791
BASE_RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
EXECUTION_MODE=vault-dry-run
UNISWAP_QUOTE_MODE=api-first
UNISWAP_API_URL=https://trade-api.gateway.uniswap.org/v1
UNISWAP_API_KEY=<from local secret store; never commit>
UNISWAP_RETRY_COUNT=2
UNISWAP_TIMEOUT_MS=10000
TREASURY_VAULT_FACTORY_ADDRESS=0x6FBbFb4F41b2366B10b93bae5D1a1A4aC3c734BA
UNIVERSAL_ROUTER_ADDRESS_84532=0x492E6456D9528771018DeB9E87ef7750EF184104
```

Health check must show:

```json
{"executionMode":"vault-dry-run","quoteMode":"api-first","integrations":{"uniswapApiConfigured":true,"treasuryVaultFactoryConfigured":true}}
```

If production shows `quoteMode: fallback` or `uniswapApiConfigured: false`, the dashboard/autopilot path will only run fallback dry-runs and will report `uniswap_api_key_not_configured`.

## Validation

Run:

```bash
Agents/test-live-production-axl-evidence.sh
```

The script writes timestamped evidence under `${TMPDIR:-/tmp}/counteragent-live-axl-evidence-*` and fails if any A0-A4 tool route, onboarding prepare, workflow result, or recent AXL trace is not clean.
