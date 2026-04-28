# CounterAgent — Contracts

Foundry workspace for CounterAgent's on-chain components. Targets **Base** (mainnet, chain id `8453`) and **Base Sepolia** (testnet, chain id `84532`).

## Layout

```
Contracts/
├── src/
│   └── MerchantRegistry.sol         # example contract — merchant treasury config
├── test/
│   └── MerchantRegistry.t.sol
├── script/
│   └── DeployMerchantRegistry.s.sol
├── foundry.toml
├── remappings.txt
└── .env.example
```

## Setup

```bash
cd Contracts
cp .env.example .env
# fill PRIVATE_KEY and BASESCAN_API_KEY
forge install        # pulls forge-std (already vendored on first init)
forge build
forge test -vv
```

## Deploy

Source the env first so `${...}` placeholders in `foundry.toml` resolve:

```bash
set -a; source .env; set +a
```

### Base Sepolia (testnet)

```bash
forge script script/DeployMerchantRegistry.s.sol:DeployMerchantRegistry \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

### Base (mainnet)

```bash
forge script script/DeployMerchantRegistry.s.sol:DeployMerchantRegistry \
  --rpc-url base \
  --broadcast \
  --verify
```

Add `--slow` if a sequencer hiccup causes nonce drift, and `-vvvv` for full traces.

## Verify after the fact

```bash
forge verify-contract \
  --chain base_sepolia \
  --watch \
  <DEPLOYED_ADDRESS> \
  src/MerchantRegistry.sol:MerchantRegistry
```

## Example contract — `MerchantRegistry`

Self-custodial registry where each merchant address writes its own treasury config (FX threshold in bps, risk tolerance, preferred stablecoin, hashed Telegram chat id). No admin, no upgrade path. Acts as an on-chain mirror / fallback to the canonical ENS text-record store described in the project docs.
