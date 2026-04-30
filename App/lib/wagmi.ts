import { createConfig, http } from "wagmi"
import { base, baseSepolia, sepolia } from "wagmi/chains"

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, sepolia],
  multiInjectedProviderDiscovery: false,
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
})
