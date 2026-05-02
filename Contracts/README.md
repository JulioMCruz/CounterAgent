# CounterAgent — Contracts

Foundry workspace for CounterAgent's on-chain components.

- **Base / Base Sepolia**: merchant treasury registry.
- **Ethereum Sepolia**: ENS subname provisioning for `counteragents.eth`.

## Layout

```text
Contracts/
├── src/
│   ├── MerchantRegistry.sol
│   └── CounterAgentENSRegistrar.sol
├── test/
│   ├── MerchantRegistry.t.sol
│   └── CounterAgentENSRegistrar.t.sol
├── script/
│   ├── DeployMerchantRegistry.s.sol
│   ├── DeployCounterAgentENSRegistrar.s.sol
│   └── AuthorizeCounterAgentENSRegistrar.s.sol
├── package.json
├── package-lock.json
├── foundry.toml
├── remappings.txt
└── .env.example
```

## Dependencies

OpenZeppelin is installed through npm and resolved by Foundry via `remappings.txt`.
Do **not** commit vendored OpenZeppelin sources under `Contracts/lib`.

```bash
cd Contracts
npm install
```

This installs:

```text
@openzeppelin/contracts
@openzeppelin/contracts-upgradeable
```

`forge-std` remains a Foundry dependency under `Contracts/lib/forge-std`.

## Build and test

```bash
cd Contracts
npm install
forge build
forge test -vv
```

Equivalent npm scripts:

```bash
npm run build
npm test -- -vv
```

## Environment

```bash
cd Contracts
cp .env.example .env
# Fill the required RPC URLs, API keys, and deployer private key locally.
```

Before deploy, source the env so `${...}` placeholders in `foundry.toml` resolve:

```bash
set -a; source .env; set +a
```

Never commit `.env`, private keys, API keys, mnemonics, or wallet secrets.

## Deploy `MerchantRegistry`

`MerchantRegistry` is deployed on Base or Base Sepolia.

### Base Sepolia

```bash
forge script script/DeployMerchantRegistry.s.sol:DeployMerchantRegistry \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

### Base

```bash
forge script script/DeployMerchantRegistry.s.sol:DeployMerchantRegistry \
  --rpc-url base \
  --broadcast \
  --verify
```

Add `--slow` if a sequencer hiccup causes nonce drift, and `-vvvv` for full traces.

## Deploy `CounterAgentENSRegistrar`

`CounterAgentENSRegistrar` is an upgradeable UUPS contract deployed on **Ethereum Sepolia** because `counteragents.eth` lives in ENS on Ethereum Sepolia.

The registrar provisions merchant subnames such as:

```text
<merchant>.counteragents.eth
```

It sets the resolver, assigns the subname owner, and writes CounterAgent text records.

Example deploy:

```bash
forge script script/DeployCounterAgentENSRegistrar.s.sol:DeployCounterAgentENSRegistrar \
  --rpc-url <ETHEREUM_SEPOLIA_RPC_URL> \
  --broadcast \
  --verify \
  -vvvv
```

After deploy, authorize the registrar by transferring `counteragents.eth` ownership in the ENS Registry to the registrar proxy:

```bash
export ENS_REGISTRAR_ADDRESS=<REGISTRAR_PROXY_ADDRESS>

forge script script/AuthorizeCounterAgentENSRegistrar.s.sol:AuthorizeCounterAgentENSRegistrar \
  --rpc-url <ETHEREUM_SEPOLIA_RPC_URL> \
  --broadcast \
  -vvvv
```

## Verify after the fact

```bash
forge verify-contract \
  --chain base_sepolia \
  --watch \
  <DEPLOYED_ADDRESS> \
  src/MerchantRegistry.sol:MerchantRegistry
```

For Ethereum Sepolia verification, use the Sepolia chain/API settings supported by Foundry/Etherscan.

## Contracts

### `MerchantRegistry`

Self-custodial registry where each merchant address writes its own treasury config:

- FX threshold in bps
- risk tolerance
- preferred stablecoin
- hashed Telegram chat id

No admin and no upgrade path. Acts as an on-chain mirror/fallback to the ENS text-record configuration.

### `CounterAgentENSRegistrar`

Upgradeable ENS provisioning contract for merchant subnames under `counteragents.eth`.

Responsibilities:

- create merchant subnames
- set the public resolver
- assign the subname to the connected merchant wallet
- write CounterAgent ENS text records
- allow controlled upgrades through the contract owner
- allow the owner to grant/revoke provisioner permissions for an agent service

Recommended runtime split:

- owner: admin/upgrade authority
- provisioner: agent service wallet allowed to create merchant subnames
- merchant: connected user wallet that receives ownership of `<merchant>.counteragents.eth`
