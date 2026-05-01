"use client"

import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { isAddress } from "viem"
import { useAccount } from "wagmi"

export function useConnectedWalletAddress() {
  const account = useAccount()
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
