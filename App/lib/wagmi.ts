import { createConfig, http } from "wagmi"
import { base, baseSepolia, mainnet, sepolia } from "wagmi/chains"

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, sepolia, mainnet],
  multiInjectedProviderDiscovery: false,
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
})
