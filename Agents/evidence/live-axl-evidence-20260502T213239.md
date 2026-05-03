# Live AXL evidence — production A0-A4

- Date: 2026-05-02 EDT
- Workflow ID: `live-axl-evidence-1777771959`
- A0 URL: `https://counteragents.cc/api/a0`
- Result: PASS

## Workflow result

- ok: `True`
- status: `completed`
- decision: `CONVERT`
- execution: `fallback-dry-run`
- report ok: `True`
- report warning: `None`

## AXL status

- mode: `transport`
- fallbackToHttp: `False`
- peers: `{'A1': True, 'A2': True, 'A3': True, 'A4': True}`

## Recent real AXL messages for workflow

| seq | from | to | type | ok | transport | error |
| --- | --- | --- | --- | --- | --- | --- |
| 21 | A0-Orchestrator | A1-Monitor | merchant-config-request | True | axl-send |  |
| 22 | A0-Orchestrator | A1-Monitor | lookup_merchant_config-mcp-request | True | axl-mcp |  |
| 23 | A1-Monitor | A0-Orchestrator | lookup_merchant_config-mcp-response | True | axl-mcp |  |
| 24 | A1-Monitor | A0-Orchestrator | merchant-config-response | True | axl-observed |  |
| 25 | A0-Orchestrator | A3-Uniswap-SwapExecution | quote-request | True | axl-send |  |
| 26 | A0-Orchestrator | A3-Uniswap-SwapExecution | get_quote-mcp-request | True | axl-mcp |  |
| 27 | A3-Uniswap-SwapExecution | A0-Orchestrator | get_quote-mcp-response | True | axl-mcp |  |
| 28 | A3-Uniswap-SwapExecution | A0-Orchestrator | quote-response | True | axl-observed |  |
| 29 | A0-Orchestrator | A2-Decision | decision-request | True | axl-send |  |
| 30 | A0-Orchestrator | A2-Decision | evaluate_decision-mcp-request | True | axl-mcp |  |
| 31 | A2-Decision | A0-Orchestrator | evaluate_decision-mcp-response | True | axl-mcp |  |
| 32 | A2-Decision | A0-Orchestrator | decision-response | True | axl-observed |  |
| 33 | A0-Orchestrator | A3-Uniswap-SwapExecution | execution-request | True | axl-send |  |
| 34 | A0-Orchestrator | A3-Uniswap-SwapExecution | execute_swap-mcp-request | True | axl-mcp |  |
| 35 | A3-Uniswap-SwapExecution | A0-Orchestrator | execute_swap-mcp-response | True | axl-mcp |  |
| 36 | A3-Uniswap-SwapExecution | A0-Orchestrator | execution-response | True | axl-observed |  |
| 37 | A0-Orchestrator | A4-Reporting | report-request | True | axl-send |  |
| 38 | A0-Orchestrator | A4-Reporting | publish_report-mcp-request | True | axl-mcp |  |
| 39 | A4-Reporting | A0-Orchestrator | publish_report-mcp-response | True | axl-mcp |  |
| 40 | A4-Reporting | A0-Orchestrator | report-response | True | axl-observed |  |
