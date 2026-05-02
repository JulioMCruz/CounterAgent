"use client"

import { useQuery } from "@tanstack/react-query"
import { KeyRound, ShieldCheck, WalletCards } from "lucide-react"
import { useChainId } from "wagmi"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { prepareVaultPlan } from "@/lib/a0"

function tokenUnitsToDisplay(value?: string, symbol = "USDC") {
  const amount = Number(value ?? 0) / 1_000_000
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${symbol}`
}

function defaultOutputForChain(chainId: number) {
  return chainId === 42220 ? "cUSD" : "USDC"
}

function expiryDate(value?: number) {
  if (!value) return "Not prepared"
  return new Date(value * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function AutopilotVaultCard() {
  const { address } = useConnectedWalletAddress()
  const chainId = useChainId()
  const planQuery = useQuery({
    queryKey: ["vault-plan", address, chainId],
    queryFn: () => prepareVaultPlan({ walletAddress: address!, chainId, mode: "moderate", preferredStablecoin: defaultOutputForChain(chainId) }),
    enabled: Boolean(address),
    staleTime: 60_000,
  })

  const policy = planQuery.data?.vault.policy
  const preferredStablecoin = planQuery.data?.vault.preferredStablecoin.symbol ?? defaultOutputForChain(chainId)
  const tokenSymbols = planQuery.data?.vault.tokenAllowlist.map((token) => token.symbol).join(" · ")

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Autopilot Vault
          </CardTitle>
          <p className="mt-1 text-sm text-card-foreground">
            Merchant-owned execution with revocable limits. A3 executes; A0 prepares policy and never holds keys or funds.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-background text-primary">
          Draft
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-4">
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <WalletCards className="h-3.5 w-3.5" />
            Trade cap
          </div>
          <p className="mt-2 text-lg font-bold text-card-foreground">
            {planQuery.isLoading ? "Loading..." : tokenUnitsToDisplay(policy?.maxTradeAmount, preferredStablecoin)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">per agent call</p>
        </div>
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Daily limit
          </div>
          <p className="mt-2 text-lg font-bold text-card-foreground">
            {planQuery.isLoading ? "Loading..." : tokenUnitsToDisplay(policy?.dailyLimit, preferredStablecoin)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">resets every UTC day</p>
        </div>
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            Guardrails
          </div>
          <p className="mt-2 text-lg font-bold text-card-foreground">
            {planQuery.isLoading ? "Loading..." : `${policy?.maxSlippageBps ?? 0} bps`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">expires {expiryDate(policy?.expiresAt)}</p>
        </div>
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Output rails
          </div>
          <p className="mt-2 text-lg font-bold text-card-foreground">{preferredStablecoin}</p>
          <p className="mt-1 text-xs text-muted-foreground">Allowed: {tokenSymbols ?? "Base + Celo stablecoins"}</p>
        </div>
      </CardContent>
    </Card>
  )
}
