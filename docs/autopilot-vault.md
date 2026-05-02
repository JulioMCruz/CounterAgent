# CounterAgent Autopilot Treasury Vault

This MVP slice establishes a merchant-owned, non-custodial vault model for CounterAgent Autopilot.

## Model

1. The merchant deploys or owns `CounterAgentTreasuryVault`.
2. The merchant allowlists stablecoins by chain: Base (USDC, EURC, USDT) or Celo (cUSD, cEUR, cREAL, cKES, cCOP, cGHS).
3. The merchant allowlists execution targets, such as a future Uniswap adapter or KeeperHub.
4. The merchant configures A3 (`A3-Uniswap-SwapExecution`) as the `authorizedAgent` and signs a bounded policy:
   - `maxTradeAmount`
   - `dailyLimit`
   - `maxSlippageBps`
   - `expiresAt`
   - `active`
5. The merchant deposits ERC20 funds with `transferFrom`.
6. A3 can call only whitelisted targets and only inside the policy.
7. The merchant can revoke the policy and withdraw directly at any time.

## Why A0 Does Not Custody Funds

A0 prepares recommendations and intent payloads. It does not receive private keys, does not receive ERC20 transfers, and does not become the vault owner. Funds move only into a merchant-owned vault. The on-chain contract enforces limits before agent execution:

- token allowlist
- target allowlist
- per-trade cap
- daily cap
- slippage cap
- policy expiry
- active/revoked state

The server can be unavailable or compromised without gaining direct withdrawal rights. The worst useful permission is bounded execution through the configured A3 executor address, and the merchant can revoke that permission on-chain. A0/App never becomes the executor; it only prepares the plan and coordinates signatures.

## Current A0 Endpoint

`POST /vault/plan` returns a draft policy and EIP-712-style intent payload for the UI. It defaults the executor to the configured `EXECUTION_AGENT_ADDRESS`, which should be A3's public execution signer. It does not require a deployed vault address.

Example body:

```json
{
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "chainId": 84532,
  "preferredStablecoin": "USDC",
  "mode": "moderate"
}
```

For Celo plans, use `chainId: 42220` and one of `cUSD`, `cEUR`, `cREAL`, `cKES`, `cCOP`, or `cGHS` as the preferred output stablecoin.

The response is intentionally a plan, not an execution instruction. A later slice can connect this to wallet signing, vault deployment, and target adapter selection.

## Contract Surface

`Contracts/src/CounterAgentTreasuryVault.sol` plus `CounterAgentTreasuryVaultFactory.sol` is deliberately small:

- owner-only `deposit`, `withdraw`, `configureAgent`, `setTokenAllowed`, `setTargetAllowed`, and `revokePolicy`
- agent-only `executeCall`
- clear events for configuration, deposits, withdrawals, policy revocation, and agent execution

The first implementation uses an opaque whitelisted target call instead of integrating Uniswap directly. This keeps the safety boundary auditable while leaving room for a dedicated router adapter.


## Next Mainnet Step

Before mainnet, rename the public ENS surface from `counteragents.eth` to `counteragents.eth`/`counteragents.eth` in product copy and ENS provisioning configuration, then deploy factories on Base and Celo mainnet.

## OpenZeppelin Upgradeability

The vault system uses OpenZeppelin upgradeable contracts:

- Deploy `CounterAgentTreasuryVaultFactory` behind an `ERC1967Proxy` using UUPS.
- The factory deploys merchant vaults as deterministic `BeaconProxy` contracts.
- The factory owns an `UpgradeableBeacon`, so a reviewed factory owner upgrade can move all merchant vault proxies to a new vault implementation while preserving merchant vault state and ownership.
- `MerchantRegistry` and `CounterAgentENSRegistrar` are also UUPS upgradeable behind `ERC1967Proxy`.

Merchant safety remains unchanged: merchant-owned vault state stays in the proxy, the merchant remains the only withdrawer, A3 remains bounded by policy, and CounterAgent never takes custody.

## Testnet Deployments — Counter Agents

Owner wallet: `0x987D68A59a5A2Ff39B723abFaD6678fd22D3510b`  
Execution agent / A3: `0xDaa23fF7820b92eA5D78457adc41Cab1af97EbbC`  
ENS parent: `counteragents.eth`

| Network | Contract | Address |
| --- | --- | --- |
| Ethereum Sepolia | ENS Registrar Proxy | `0x1e25Aac761220e991DD65f8Cd74045007AbAa445` |
| Ethereum Sepolia | ENS Registrar Implementation | `0xd532D7C9Ddc28d16601FaA5Cc6F54cDABb703C28` |
| Base Sepolia | MerchantRegistry Proxy | `0x9857d987F57607b1e6431Ab94D26a866870b7a3D` |
| Base Sepolia | TreasuryVaultFactory Proxy | `0x6FBbFb4F41b2366B10b93bae5D1a1A4aC3c734BA` |
| Base Sepolia | TreasuryVault Beacon | `0x556Ae9f1451EE58f649DDd896c54170672c31f5D` |
| Base Sepolia | TreasuryVault Implementation | `0x22fB8006F52705B68Ed53cAa7D04494f1a3d556b` |
| Celo Sepolia | MerchantRegistry Proxy | `0x1e25Aac761220e991DD65f8Cd74045007AbAa445` |
| Celo Sepolia | TreasuryVaultFactory Proxy | `0xaD85EC495f8782fC581C0f06e73e4075A7C077E9` |
| Celo Sepolia | TreasuryVault Beacon | `0xc6A8506cfDd83F4E8739D7aB18fCEABfa35fa97A` |
| Celo Sepolia | TreasuryVault Implementation | `0x048F81D4C1bB6256AB17514DD9fc6897BeD91c26` |

Full machine-readable deployment metadata: `deployments/counteragent-testnet.json`.
