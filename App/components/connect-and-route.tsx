"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi"
import { resolveSession } from "@/lib/a0"
import { merchantRegistryAbi } from "@/lib/merchant-registry-abi"
import { activeChain, activeChainSwitchParams, merchantRegistryAddress, merchantRegistryConfigured } from "@/lib/registry"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const dynamicConfigured = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)

export function ConnectAndRoute() {
  const router = useRouter()
  const { address } = useAccount()
  const { primaryWallet } = useDynamicContext()
  const wagmiChainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [routeStatus, setRouteStatus] = useState<"idle" | "checking" | "fallback">("idle")
  const [networkStatus, setNetworkStatus] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false)
  const [dynamicChainId, setDynamicChainId] = useState<number | null>(null)
  const [providerChainId, setProviderChainId] = useState<number | null>(null)
  const observedChainIds = [wagmiChainId, dynamicChainId, providerChainId].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  )
  const connectedToTargetChain = observedChainIds.includes(activeChain.id)
  const visibleChainId = providerChainId ?? dynamicChainId ?? wagmiChainId

  const { data: registered, isLoading } = useReadContract({
    address: merchantRegistryAddress,
    abi: merchantRegistryAbi,
    functionName: "isActive",
    args: address ? [address] : undefined,
    query: { enabled: !!address && connectedToTargetChain && merchantRegistryConfigured },
  })

  async function requestNetworkSwitch() {
    setNetworkError(null)
    setNetworkStatus(`Requesting ${activeChain.name} in your wallet…`)
    setIsSwitchingNetwork(true)
    try {
      if (primaryWallet?.connector?.switchNetwork) {
        await primaryWallet.connector.switchNetwork({
          networkChainId: activeChain.id,
          networkName: activeChain.name,
        })
      } else {
        await switchChainAsync(activeChainSwitchParams)
      }
      setNetworkStatus(`Connected to ${activeChain.name}. Continuing…`)
    } catch (dynamicError) {
      try {
        await switchChainAsync(activeChainSwitchParams)
        setNetworkStatus(`Connected to ${activeChain.name}. Continuing…`)
      } catch (wagmiError) {
        try {
          const provider = (window as typeof window & {
            ethereum?: {
              request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
            }
          }).ethereum
          if (!provider) throw wagmiError
          const hexChainId = `0x${activeChain.id.toString(16)}`
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: hexChainId }],
            })
          } catch (switchError) {
            const code = typeof switchError === "object" && switchError && "code" in switchError ? switchError.code : undefined
            if (code !== 4902) throw switchError
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  blockExplorerUrls: activeChainSwitchParams.addEthereumChainParameter.blockExplorerUrls,
                  chainId: hexChainId,
                  chainName: activeChainSwitchParams.addEthereumChainParameter.chainName,
                  nativeCurrency: activeChainSwitchParams.addEthereumChainParameter.nativeCurrency,
                  rpcUrls: activeChainSwitchParams.addEthereumChainParameter.rpcUrls,
                },
              ],
            })
          }
          setNetworkStatus(`Connected to ${activeChain.name}. Continuing…`)
        } catch (providerError) {
          const error = providerError instanceof Error ? providerError : dynamicError
          const message = error instanceof Error ? error.message : "Wallet did not open a network switch popup."
          setNetworkError(`${message} Please switch manually to ${activeChain.name} (chain ID ${activeChain.id}).`)
        }
      }
    } finally {
      setIsSwitchingNetwork(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function refreshNetworkState() {
      try {
        const network = await primaryWallet?.connector?.getNetwork?.()
        if (!cancelled && network) setDynamicChainId(Number(network))
      } catch {
        if (!cancelled) setDynamicChainId(null)
      }

      try {
        const provider = (window as typeof window & {
          ethereum?: {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
          }
        }).ethereum
        const hexChainId = provider ? await provider.request({ method: "eth_chainId" }) : null
        if (!cancelled && typeof hexChainId === "string") setProviderChainId(Number.parseInt(hexChainId, 16))
      } catch {
        if (!cancelled) setProviderChainId(null)
      }
    }

    refreshNetworkState()
    const interval = window.setInterval(refreshNetworkState, 1500)
    const provider = (window as typeof window & {
      ethereum?: {
        on?: (event: string, handler: (chainId: string) => void) => void
        removeListener?: (event: string, handler: (chainId: string) => void) => void
      }
    }).ethereum
    const onChainChanged = (hexChainId: string) => setProviderChainId(Number.parseInt(hexChainId, 16))
    provider?.on?.("chainChanged", onChainChanged)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      provider?.removeListener?.("chainChanged", onChainChanged)
    }
  }, [primaryWallet])

  useEffect(() => {
    if (!address || !connectedToTargetChain) return

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
  }, [address, connectedToTargetChain, router])

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
      <Dialog open={!!address && !connectedToTargetChain}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Switch to {activeChain.name}</DialogTitle>
            <DialogDescription>
              CounterAgent onboarding runs on {activeChain.name} (chain ID {activeChain.id}). Your wallet is currently on chain {visibleChainId || "unknown"}.
            </DialogDescription>
          </DialogHeader>
          <p className="font-mono text-[11px] text-muted-foreground">
            Debug chain: wagmi={wagmiChainId || "?"} dynamic={dynamicChainId || "?"} provider={providerChainId || "?"}
          </p>
          <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            Click the button below to ask your wallet to switch networks. If your wallet does not support automatic switching, switch manually in the wallet network selector.
          </div>
          {(networkStatus || networkError) && (
            <p className={`text-xs ${networkError ? "text-destructive" : "text-muted-foreground"}`}>
              {networkError || networkStatus}
            </p>
          )}
          <DialogFooter>
            <Button type="button" onClick={requestNetworkSwitch} disabled={isSwitchingNetwork} className="w-full">
              {isSwitchingNetwork ? "Opening wallet…" : `Switch to ${activeChain.name}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {address && !connectedToTargetChain && (
        <div className="mt-3 max-w-sm rounded-2xl border border-primary/30 bg-background p-4 text-foreground shadow-lg">
          <p className="text-sm font-bold">Wrong wallet network</p>
          <p className="mt-1 text-xs text-muted-foreground">
            CounterAgent runs on {activeChain.name}. Current chain: {visibleChainId || "unknown"}. Switch networks before onboarding.
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Debug chain: wagmi={wagmiChainId || "?"} dynamic={dynamicChainId || "?"} provider={providerChainId || "?"}
          </p>
          <button
            type="button"
            onClick={requestNetworkSwitch}
            disabled={isSwitchingNetwork}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isSwitchingNetwork ? "Opening wallet…" : `Switch to ${activeChain.name}`}
          </button>
          {(networkStatus || networkError) && (
            <p className={`mt-2 text-xs ${networkError ? "text-destructive" : "text-muted-foreground"}`}>
              {networkError || networkStatus}
            </p>
          )}
        </div>
      )}
      {address && routeStatus === "checking" && (
        <p className="text-xs text-header-foreground/60">Checking your treasury with the Orchestrator…</p>
      )}
      {address && routeStatus === "fallback" && isLoading && (
        <p className="text-xs text-header-foreground/60">Checking your treasury…</p>
      )}
    </div>
  )
}
