# Gensyn AXL Transport Plugin

Shared transport plugin intended to run next to every CounterAgent service.

Each agent gets its own instance with a distinct `AXL_AGENT_ID`, port, and optional real `AXL_NODE_URL`.

## API

- `GET /healthz`
- `GET /topology`
- `POST /send`
- `GET /recv`
- `POST /mcp/:peerId/:service`
- `POST /local/inbox`

## Modes

- `AXL_MODE=local`: deterministic local multi-agent test mode.
- `AXL_MODE=real`: proxies `/topology` and `/send` to `AXL_NODE_URL` and rejects missing real node config when `AXL_REQUIRE_REAL_NODE=true`.

Local mode proves the shared plugin installation and agent-to-agent contract. Real mode is the only mode that should be used for final P2P AXL claims.
