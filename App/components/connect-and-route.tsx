"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { DynamicWidget } from "@dynamic-labs/sdk-react-core"
import { useAccount, useReadContract } from "wagmi"
import { merchantRegistryAbi } from "@/lib/merchant-registry-abi"
import { merchantRegistryAddress, merchantRegistryConfigured } from "@/lib/registry"

export function ConnectAndRoute() {
  const router = useRouter()
  const { address } = useAccount()

  const { data: registered, isLoading } = useReadContract({
    address: merchantRegistryAddress,
    abi: merchantRegistryAbi,
    functionName: "isActive",
    args: address ? [address] : undefined,
    query: { enabled: !!address && merchantRegistryConfigured },
  })

  useEffect(() => {
    if (!address) return
    // If the registry isn't configured yet, fall back to onboarding so the user
    // can still walk the flow during local dev.
    if (!merchantRegistryConfigured) {
      router.push("/onboarding")
      return
    }
    if (isLoading || registered === undefined) return
    router.push(registered ? "/dashboard" : "/onboarding")
  }, [address, registered, isLoading, router])

  return (
    <div className="flex flex-col items-start gap-2">
      <DynamicWidget />
      {address && isLoading && (
        <p className="text-xs text-header-foreground/60">Checking your treasury…</p>
      )}
    </div>
  )
}
