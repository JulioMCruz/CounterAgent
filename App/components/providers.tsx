"use client"

import { useEffect, useState } from "react"
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core"
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum"
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { dynamicEvmNetworks } from "@/lib/registry"
import { wagmiConfig } from "@/lib/wagmi"
import { dynamicConfigured, dynamicEnvironmentId } from "@/lib/dynamic-config"

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (!dynamicConfigured) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    )
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId!,
        overrides: {
          evmNetworks: (dashboardNetworks) => {
            const merged = [...dynamicEvmNetworks, ...dashboardNetworks]
            return merged.filter(
              (network, index, networks) =>
                networks.findIndex((candidate) => Number(candidate.chainId) === Number(network.chainId)) === index
            )
          },
        },
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>{children}</DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  )
}
