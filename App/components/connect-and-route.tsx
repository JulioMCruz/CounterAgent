"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DynamicWidget } from "@dynamic-labs/sdk-react-core"
import { useAccount, useReadContract } from "wagmi"
import { resolveSession } from "@/lib/a0"
import { merchantRegistryAbi } from "@/lib/merchant-registry-abi"
import { activeChain, merchantRegistryAddress, merchantRegistryConfigured } from "@/lib/registry"

const dynamicConfigured = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)

export function ConnectAndRoute() {
  const router = useRouter()
  const { address } = useAccount()
  const [routeStatus, setRouteStatus] = useState<"idle" | "checking" | "fallback">("idle")

  const { data: registered, isLoading } = useReadContract({
    address: merchantRegistryAddress,
    abi: merchantRegistryAbi,
    functionName: "isActive",
    args: address ? [address] : undefined,
    query: { enabled: !!address && merchantRegistryConfigured },
  })

  useEffect(() => {
    if (!address) return

    let cancelled = false
    setRouteStatus("checking")

    resolveSession({ walletAddress: address, chainId: activeChain.id })
      .then((session) => {
        if (cancelled) return
        router.push(session.route === "dashboard" ? "/dashboard" : "/onboarding")
      })
      .catch(() => {
        if (cancelled) return
        setRouteStatus("fallback")
      })

    return () => {
      cancelled = true
    }
  }, [address, router])

  useEffect(() => {
    if (!address || routeStatus !== "fallback") return
    // If the Orchestrator is not reachable yet, fall back to local registry reads.
    if (!merchantRegistryConfigured) {
      router.push("/onboarding")
      return
    }
    if (isLoading || registered === undefined) return
    router.push(registered ? "/dashboard" : "/onboarding")
  }, [address, registered, isLoading, routeStatus, router])

  if (!dynamicConfigured) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground opacity-70"
          disabled
          type="button"
        >
          Wallet setup pending
        </button>
        <p className="max-w-sm text-xs text-header-foreground/60">
          Dynamic environment is not configured yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <DynamicWidget />
      {address && routeStatus === "checking" && (
        <p className="text-xs text-header-foreground/60">Checking your treasury with the Orchestrator…</p>
      )}
      {address && routeStatus === "fallback" && isLoading && (
        <p className="text-xs text-header-foreground/60">Checking your treasury…</p>
      )}
    </div>
  )
}
