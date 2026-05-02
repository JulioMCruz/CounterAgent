# Gensyn AXL EC2 deployment runbook

This runbook documents the production-style CounterAgent AXL deployment used for real agent-to-agent transport.

## Architecture

CounterAgent runs one dedicated EC2 node per agent:

- A0 Orchestrator EC2: app + official Gensyn AXL node + AXL transport bridge + proxy
- A1 Monitor EC2: app + official Gensyn AXL node + AXL transport bridge + proxy
- A2 Decision EC2: app + official Gensyn AXL node + AXL transport bridge + proxy
- A3 Execution EC2: app + official Gensyn AXL node + AXL transport bridge + proxy
- A4 Reporting EC2: app + official Gensyn AXL node + AXL transport bridge + proxy

Each node has its own stable public endpoint and its own AXL public key. The public app domain `counteragents.cc` is served by Netlify over HTTPS; the agent subdomains expose the matching EC2 nodes.

## Public endpoints

Use the public DNS names, not raw IPs, in scripts and demos:

- `orchestrator.counteragents.cc`
- `monitor.counteragents.cc`
- `decision.counteragents.cc`
- `execution.counteragents.cc`
- `reporting.counteragents.cc`

Each endpoint exposes:

- `/healthz` for the agent health check
- `/axl/topology` for official AXL topology
- `/axl/send` for AXL send
- `/axl/recv` for AXL receive
- `/axl/mcp/:peerId/:service` for AXL MCP calls between agent services

## Network requirements

The EC2 security group must allow:

- TCP `80`/`443` from the internet for public HTTP/HTTPS proxy traffic
- TCP `9001` from the internet for AXL peer connections

The AXL HTTP API stays local on each EC2 node and is reached through the local bridge/proxy.

## Runtime layout per EC2

Each EC2 node runs Docker containers with restart policies:

- `app`: the CounterAgent role service
- `axl-node`: official Gensyn AXL node
- `axl`: CounterAgent AXL transport bridge
- `proxy`: public HTTP routing to app and AXL bridge

The bridge talks to the local official AXL node at `http://127.0.0.1:9002`.

## AXL peering

Each official AXL node is configured with the public AXL peer endpoints for the other agents:

```text
tls://<other-agent-dns-or-ip>:9001
```

Peer identity is the official AXL public key reported by `/axl/topology`, not the DNS name.

## Validation

Run the real P2P test:

```bash
AXL_A0_URL=https://orchestrator.counteragents.cc/axl \
AXL_A1_URL=https://monitor.counteragents.cc/axl \
AXL_A2_URL=https://decision.counteragents.cc/axl \
AXL_A3_URL=https://execution.counteragents.cc/axl \
AXL_A4_URL=https://reporting.counteragents.cc/axl \
AXL_PEER_A1=<A1_PUBLIC_KEY> \
AXL_PEER_A2=<A2_PUBLIC_KEY> \
AXL_PEER_A3=<A3_PUBLIC_KEY> \
AXL_PEER_A4=<A4_PUBLIC_KEY> \
REQUIRE_HTTPS_AXL=true \
Gensyn/test-real-axl-p2p.sh
```

Expected result:

```text
real AXL P2P send/recv passed
```

Run the CounterAgent workflow test over real AXL transport:

```bash
AXL_A0_URL=https://orchestrator.counteragents.cc/axl \
A0_URL=https://orchestrator.counteragents.cc \
AXL_A1_URL=https://monitor.counteragents.cc/axl \
AXL_A2_URL=https://decision.counteragents.cc/axl \
AXL_A3_URL=https://execution.counteragents.cc/axl \
AXL_A4_URL=https://reporting.counteragents.cc/axl \
AXL_PEER_A1=<A1_PUBLIC_KEY> \
AXL_PEER_A2=<A2_PUBLIC_KEY> \
AXL_PEER_A3=<A3_PUBLIC_KEY> \
AXL_PEER_A4=<A4_PUBLIC_KEY> \
REQUIRE_HTTPS_AXL=true \
Gensyn/test-real-axl-counteragent-workflow.sh
```

Expected result:

```text
CounterAgent real AXL workflow test passed
```

## Current validated state

The final validated deployment uses five dedicated EC2 nodes with Elastic IPs directly associated to the nodes. The Network Load Balancers are not required for this direct-node architecture.

Validated checks:

- all five `/healthz` endpoints return live status
- all five `/axl/topology` endpoints return distinct official AXL public keys
- AXL peers are reported as up
- A0 to A1/A2/A3/A4 real AXL send/recv passes
- CounterAgent workflow through real AXL MCP transport passes across A1 monitor, A2 decision, A3 execution, and A4 reporting

## Operational notes

If Elastic IPs are moved or networking changes, restart the EC2 nodes or the AXL containers so stale AXL peer connections are cleared.

If using AWS permissions for operations, the deploy user needs at least:

- `ec2:Describe*`
- `ec2:RunInstances`
- `ec2:RebootInstances`
- `ec2:AssociateAddress`
- `ec2:CreateTags`

For container-level restarts without rebooting EC2, use SSM permissions and restart only `axl-node` and `axl`.
