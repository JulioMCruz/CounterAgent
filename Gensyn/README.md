# Gensyn AXL real transport

These scripts and notes are for proving real AXL communication with separate node APIs and peer IDs.

The validated deployment uses five dedicated EC2 nodes, one per CounterAgent agent, each running the agent app, an official Gensyn AXL node, the CounterAgent AXL transport bridge, and a proxy. See [`AXL-EC2-RUNBOOK.md`](./AXL-EC2-RUNBOOK.md) for the deployment runbook.

## 1. Configure node URLs and peer IDs

Copy the example values into your shell and replace placeholders:

```bash
source Gensyn/env.real-axl.example
export AXL_A0_URL=http://orchestrator.counteragents.cc/axl
export AXL_A2_URL=http://decision.counteragents.cc/axl
export AXL_A3_URL=http://execution.counteragents.cc/axl
export AXL_PEER_A2=...
export AXL_PEER_A3=...
```

Use the existing public DNS names with the `/axl` route for the real node APIs. App/A0/A1/A2/A3/A4 DNS: `counteragents.cc`, `orchestrator.counteragents.cc`, `monitor.counteragents.cc`, `decision.counteragents.cc`, `execution.counteragents.cc`, `reporting.counteragents.cc`. Use separate real node APIs for A0, A2, and A3. The P2P script refuses localhost unless `ALLOW_LOCAL_AXL=true` is set for an intentional multi-process local node test, and refuses private LAN URLs unless `ALLOW_PRIVATE_AXL=true` is set. It also rejects adapter/mock topology responses and requires each receiving node topology to report the expected peer ID.

## 2. Test raw AXL P2P send/recv

```bash
Gensyn/test-real-axl-p2p.sh
```

This verifies:
- `GET /topology` on all node APIs
- topologies are not adapter/mock responses
- each node has a distinct own public key / peer ID
- A0 topology includes the configured A2/A3 peer IDs
- A0 node `POST /send` to A2 peer with a random nonce
- A2 node receives the same nonce via `GET /recv`
- A0 node `POST /send` to A3 peer with a random nonce
- A3 node receives the same nonce via `GET /recv`

## 3. Test CounterAgent workflow over AXL MCP

```bash
Gensyn/test-real-axl-counteragent-workflow.sh
```

This verifies:
- AXL MCP route to A2 service
- AXL MCP route to A3 service
- A0 `/workflow/evaluate` in `GENSYN_AXL_MODE=transport`
- `GENSYN_AXL_FALLBACK_HTTP=false`

If this script passes against separate nodes, the demo can honestly claim agent communication is using real AXL transport.
