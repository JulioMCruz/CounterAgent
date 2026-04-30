"use client"

import { useCallback, useMemo, useState } from "react"
import type { Chain } from "viem"
import { useChainId, useSwitchChain } from "wagmi"
import { ChainGuardError, readInjectedChainId } from "@/lib/chain-guard"

type RequiredChainStatus = "ready" | "wrong" | "switching" | "unknown"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function useRequiredChain(targetChain: Chain) {
  const chainId = useChainId()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [switchingTo, setSwitchingTo] = useState<number | null>(null)

  const status: RequiredChainStatus = useMemo(() => {
    if (switchingTo === targetChain.id || isPending) return "switching"
    if (!chainId) return "unknown"
    return chainId === targetChain.id ? "ready" : "wrong"
  }, [chainId, isPending, switchingTo, targetChain.id])

  const ensureChain = useCallback(async () => {
    const injectedBefore = await readInjectedChainId()
    const current = injectedBefore ?? chainId
    if (current === targetChain.id) return true

    setSwitchingTo(targetChain.id)
    try {
      await switchChainAsync({ chainId: targetChain.id })

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const injectedAfter = await readInjectedChainId()
        if ((injectedAfter ?? targetChain.id) === targetChain.id) return true
        await sleep(250)
      }

      throw new ChainGuardError(
        `Wallet did not switch to ${targetChain.name}. Please switch manually and retry.`,
        "chain_mismatch",
        targetChain
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      const lower = message.toLowerCase()
      if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
        throw new ChainGuardError(`Network switch to ${targetChain.name} was rejected.`, "switch_rejected", targetChain)
      }
      if (lower.includes("switch chain") || lower.includes("unsupported") || lower.includes("wallet_addethereumchain")) {
        throw new ChainGuardError(
          `This wallet cannot switch automatically. Please switch to ${targetChain.name} manually and retry.`,
          "switch_unsupported",
          targetChain
        )
      }
      throw error
    } finally {
      setSwitchingTo(null)
    }
  }, [chainId, switchChainAsync, targetChain])

  return {
    currentChainId: chainId,
    ensureChain,
    isCorrectChain: status === "ready",
    isSwitching: status === "switching",
    requiredChain: targetChain,
    status,
  }
}
