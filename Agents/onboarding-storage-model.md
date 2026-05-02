# CounterAgent Onboarding Storage Model

CounterAgent uses a dual-layer storage model for onboarding configuration.

## Summary

```text
App onboarding
  -> Base Sepolia MerchantRegistry: execution source of truth
  -> Orchestrator / A1 Monitor: ENS provisioning
  -> ENS text records: public discovery/config mirror
```

## Base Sepolia: execution source of truth

`MerchantRegistry` stores the values that execution agents and contracts should verify before acting:

- FX threshold in basis points
- risk tolerance enum
- preferred stablecoin address
- hashed notification/chat identifier
- active status

This is the right place for values that affect treasury execution because Base is the execution chain for the app flow.

## ENS: public identity and discovery mirror

`<merchant>.counteragents.eth` stores public, agent-readable metadata:

- merchant wallet
- FX threshold in basis points
- risk tolerance label
- preferred stablecoin symbol
- registry address
- config version

A1 ENS/Monitor provisions and reads these records. Other agents can use ENS for discovery and routing, then verify execution-sensitive state against Base Sepolia before acting.

## Encryption and privacy

ENS text records are public. ENS does not provide built-in encrypted metadata.

Do not place secrets, private notification targets, API keys, or sensitive user data in raw ENS text records.

Recommended handling:

- public config: ENS text records
- execution config: Base Sepolia registry
- sensitive config: encrypted offchain storage or server-side secret storage
- notification IDs: hash onchain; reveal raw values only to trusted server-side services when needed

If encrypted metadata is needed later, store an encrypted blob offchain or on a storage layer and put only a URI/content hash in ENS.

## Agent responsibilities

- A0 Orchestrator: coordinates onboarding and routing.
- A1 ENS/Monitor: provisions ENS and reads public config.
- A2 Decision: consumes normalized config and policy.
- A3 Execution: verifies Base registry state before execution.
- A4 Reporting: can write audit/report artifacts to 0G Storage later.

## 0G Storage fit

0G Storage is already part of the reporting/audit direction. It is a good fit for larger artifacts that should not live directly in ENS or the Base registry:

- execution reports
- decision traces
- merchant-facing audit summaries
- encrypted preference blobs, if needed later

Recommended pattern:

```text
Base Sepolia: compact execution config / verification state
ENS: public identity + discovery pointers
0G Storage: larger reports, audit logs, optional encrypted metadata blobs
```

If sensitive onboarding metadata needs decentralized storage, encrypt it client-side or server-side first, store the encrypted blob in 0G Storage, and put only the content pointer/hash in ENS.
