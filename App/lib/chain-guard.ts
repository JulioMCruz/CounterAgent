import type { Chain } from "viem"

export type ChainGuardErrorKind = "switch_rejected" | "switch_unsupported" | "chain_mismatch" | "unknown"

export class ChainGuardError extends Error {
  kind: ChainGuardErrorKind
  targetChain: Pick<Chain, "id" | "name">

  constructor(message: string, kind: ChainGuardErrorKind, targetChain: Pick<Chain, "id" | "name">) {
    super(message)
    this.name = "ChainGuardError"
    this.kind = kind
    this.targetChain = targetChain
  }
}

export function getFriendlyChainError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  const lower = message.toLowerCase()

  if (error instanceof ChainGuardError) return error.message
  if (lower.includes("current chain of the wallet") || lower.includes("chainmismatch")) {
    return "Wallet is on the wrong network. Please switch networks and retry."
  }
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Wallet network switch or confirmation was rejected. Please try again when ready."
  }
  if (lower.includes("switch chain") || lower.includes("wallet_addethereumchain") || lower.includes("unsupported")) {
    return "This wallet could not switch networks automatically. Please switch manually in your wallet and retry."
  }

  return message || fallback
}

export async function readInjectedChainId() {
  if (typeof window === "undefined") return undefined
  const ethereum = (window as unknown as { ethereum?: { request?: (args: { method: string }) => Promise<string> } }).ethereum
  if (!ethereum?.request) return undefined
  try {
    const hex = await ethereum.request({ method: "eth_chainId" })
    return Number.parseInt(hex, 16)
  } catch {
    return undefined
  }
}
