"use client"

import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { isAddress } from "viem"
import { useAccount } from "wagmi"
import { dynamicConfigured } from "@/lib/dynamic-config"

export function useConnectedWalletAddress() {
  const account = useAccount()

  if (!dynamicConfigured) {
    return {
      address: account.address,
      chainId: account.chainId,
      isConnected: account.isConnected,
      isConnecting: account.isConnecting,
      wagmiAddress: account.address,
      dynamicAddress: undefined,
      sdkHasLoaded: true,
    }
  }

  return useDynamicConnectedWalletAddress(account)
}

function useDynamicConnectedWalletAddress(account: ReturnType<typeof useAccount>) {
  const { primaryWallet, sdkHasLoaded } = useDynamicContext()
  const dynamicAddress = primaryWallet?.address
  const address = account.address ?? (dynamicAddress && isAddress(dynamicAddress) ? dynamicAddress : undefined)

  return {
    address: address as `0x${string}` | undefined,
    chainId: account.chainId,
    isConnected: account.isConnected || Boolean(address),
    isConnecting: account.isConnecting || !sdkHasLoaded,
    wagmiAddress: account.address,
    dynamicAddress,
    sdkHasLoaded,
  }
}
