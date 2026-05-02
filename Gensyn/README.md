# Gensyn AXL real transport

These scripts and notes are for proving real AXL communication with separate node APIs and peer IDs.

The validated deployment uses five dedicated EC2 nodes, one per CounterAgent agent, each running the agent app, an official Gensyn AXL node, the CounterAgent AXL transport bridge, and a proxy. The public app domain `https://counteragents.cc` points to the Netlify app; the agent subdomains expose each agent and its `/axl` route. See [`AXL-EC2-RUNBOOK.md`](./AXL-EC2-RUNBOOK.md) for the deployment runbook.

## 1. Configure node URLs and peer IDs

Copy the example values into your shell and replace placeholders:

```bash
source Gensyn/env.real-axl.example
export AXL_A0_URL=https://orchestrator.counteragents.cc/axl
export AXL_A1_URL=https://monitor.counteragents.cc/axl
export AXL_A2_URL=https://decision.counteragents.cc/axl
export AXL_A3_URL=https://execution.counteragents.cc/axl
export AXL_A4_URL=https://reporting.counteragents.cc/axl
export AXL_PEER_A1=...
export AXL_PEER_A2=...
export AXL_PEER_A3=...
export AXL_PEER_A4=...
```

Use the existing public DNS names with the `/axl` route for the real node APIs. App/A0/A1/A2/A3/A4 DNS: `counteragents.cc`, `orchestrator.counteragents.cc`, `monitor.counteragents.cc`, `decision.counteragents.cc`, `execution.counteragents.cc`, `reporting.counteragents.cc`. Use separate real node APIs for A0, A1, A2, A3, and A4. The P2P script refuses localhost unless `ALLOW_LOCAL_AXL=true` is set for an intentional multi-process local node test, and refuses private LAN URLs unless `ALLOW_PRIVATE_AXL=true` is set. It also rejects adapter/mock topology responses and requires each receiving node topology to report the expected peer ID.

## 2. Test raw AXL P2P send/recv

```bash
Gensyn/test-real-axl-p2p.sh
```

This verifies:
- `GET /topology` on all five node APIs
- topologies are not adapter/mock responses
- each node has a distinct own public key / peer ID
- A0 topology includes the configured A1/A2/A3/A4 peer IDs
- A0 node `POST /send` to A1, A2, A3, and A4 peers with random nonces
- each receiving node gets the matching nonce via `GET /recv`

## 3. Test CounterAgent workflow over AXL MCP

```bash
Gensyn/test-real-axl-counteragent-workflow.sh
```

This verifies:
- AXL MCP route to A1 monitor service
- AXL MCP route to A2 decision service
- AXL MCP route to A3 execution service
- AXL MCP route to A4 reporting service
- A0 `/workflow/evaluate` in `GENSYN_AXL_MODE=transport`
- `GENSYN_AXL_FALLBACK_HTTP=false`

## 4. One-shot all-agent check

```bash
Agents/test-all-agent-axl-workflow.sh
```

This wrapper runs both real P2P and workflow checks for A1 through A4.

If these scripts pass against separate nodes, the demo can honestly claim agent communication is using real AXL transport across all CounterAgent agents.
