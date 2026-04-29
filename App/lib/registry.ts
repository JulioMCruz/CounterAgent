import { base, baseSepolia } from "wagmi/chains"

export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === "base" ? base : baseSepolia

export const activeChainSwitchParams = {
  chainId: activeChain.id,
  addEthereumChainParameter: {
    chainName: activeChain.name,
    nativeCurrency: activeChain.nativeCurrency,
    rpcUrls: activeChain.id === base.id ? ["https://mainnet.base.org"] : ["https://sepolia.base.org"],
    blockExplorerUrls:
      activeChain.id === base.id ? ["https://basescan.org"] : ["https://sepolia.basescan.org"],
  },
} as const

export const merchantRegistryAddress = process.env
  .NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS as `0x${string}` | undefined

export const merchantRegistryConfigured = Boolean(merchantRegistryAddress)

export const RiskTolerance = {
  Conservative: 0,
  Moderate: 1,
  Aggressive: 2,
} as const

export type RiskToleranceLabel = keyof typeof RiskTolerance

// USDC / EURC / USDT canonical addresses on Base mainnet — we register the chosen
// symbol against its mainnet address so the value carries semantic meaning even
// when the registry itself is deployed on Base Sepolia.
export const stablecoinAddresses: Record<string, `0x${string}`> = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
}
