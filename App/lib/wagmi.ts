import { createConfig, http } from "wagmi"
import { base, baseSepolia } from "wagmi/chains"

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  multiInjectedProviderDiscovery: false,
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
})
