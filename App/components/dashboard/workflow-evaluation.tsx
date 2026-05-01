"use client"

import { useMemo, useState } from "react"
import { ArrowRightLeft, CheckCircle2, Database, Loader2, Play, ShieldCheck } from "lucide-react"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { evaluateWorkflow, type WorkflowEvaluateResponse } from "@/lib/a0"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type TokenSymbol = "USDC" | "EURC" | "USDT"
type RiskTolerance = "conservative" | "moderate" | "aggressive"

const tokenOptions: TokenSymbol[] = ["EURC", "USDC", "USDT"]

function formatRate(rate?: number) {
  if (!rate) return "—"
  return rate.toFixed(4)
}

function formatConfidence(confidence?: number) {
  if (typeof confidence !== "number") return "—"
  return `${Math.round(confidence)}%`
}

function shortHash(value?: string | null) {
  if (!value) return "—"
  if (value.length <= 18) return value
  return `${value.slice(0, 10)}…${value.slice(-8)}`
}

export function WorkflowEvaluation({ onCompleted }: { onCompleted?: () => void }) {
  const { address, chainId } = useConnectedWalletAddress()
  const [result, setResult] = useState<WorkflowEvaluateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [amount, setAmount] = useState("100")
  const [fromToken, setFromToken] = useState<TokenSymbol>("EURC")
  const [toToken, setToToken] = useState<TokenSymbol>("USDC")
  const [baselineRate, setBaselineRate] = useState("1.07")
  const [fxThresholdBps, setFxThresholdBps] = useState("50")
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("moderate")

  const workflowId = useMemo(() => {
    if (!address) return undefined
    return `dashboard-${address.slice(2, 10).toLowerCase()}-${Date.now()}`
  }, [address])

  async function runWorkflow() {
    if (!address) {
      setError("Connect a wallet to run the workflow.")
      return
    }

    const parsedAmount = Number(amount.replace(/,/g, ""))
    const parsedBaselineRate = Number(baselineRate)
    const parsedThreshold = Number(fxThresholdBps)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a positive amount.")
      return
    }
    if (!Number.isFinite(parsedBaselineRate) || parsedBaselineRate <= 0) {
      setError("Enter a positive baseline/oracle rate.")
      return
    }
    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 10_000) {
      setError("FX threshold must be an integer between 0 and 10000 bps.")
      return
    }

    setIsRunning(true)
    setError(null)

    try {
      const response = await evaluateWorkflow({
        workflowId,
        merchantEns: "dashboard.counteragent.eth",
        walletAddress: address,
        chainId: chainId ?? 84532,
        fromToken,
        toToken,
        amount,
        fxThresholdBps: parsedThreshold,
        riskTolerance,
        baselineRate: parsedBaselineRate,
        metadata: {
          source: "dashboard",
          mode: "dry-run",
        },
      })

      setResult(response)
      onCompleted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow request failed")
    } finally {
      setIsRunning(false)
    }
  }

  const quote = result?.quote?.quote
  const decision = result?.decision?.decision
  const executionStatus = result?.execution?.status ?? result?.status
  const reportUri = result?.report?.storageUri ?? result?.report?.rootHash ?? result?.report?.contentHash
  const quoteProvider = quote && "provider" in quote ? String(quote.provider) : undefined
  const fallbackReason = quote && "fallbackReason" in quote ? String(quote.fallbackReason) : undefined

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Live Agent Workflow
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs Orchestration Agent → Uniswap API quote → Decision Agent → Execution dry-run → Reporting Agent.
          </p>
        </div>
        <Button type="button" onClick={runWorkflow} disabled={isRunning || !address} size="sm">
          {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
          {isRunning ? "Running" : "Run dry-run"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="workflow-amount">Amount</Label>
            <Input id="workflow-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>From</Label>
            <Select value={fromToken} onValueChange={(value) => setFromToken(value as TokenSymbol)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tokenOptions.map((token) => <SelectItem key={token} value={token}>{token}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Select value={toToken} onValueChange={(value) => setToToken(value as TokenSymbol)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tokenOptions.map((token) => <SelectItem key={token} value={token}>{token}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-baseline">Oracle rate</Label>
            <Input id="workflow-baseline" inputMode="decimal" value={baselineRate} onChange={(event) => setBaselineRate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-threshold">Threshold bps</Label>
            <Input id="workflow-threshold" inputMode="numeric" value={fxThresholdBps} onChange={(event) => setFxThresholdBps(event.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-2">
            <Label>Risk</Label>
            <Select value={riskTolerance} onValueChange={(value) => setRiskTolerance(value as RiskTolerance)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!address && (
          <p className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/60 p-3 text-sm text-muted-foreground">
            Connect your wallet to run the connected agent workflow.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {result && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-background/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Quote
              </div>
              <p className="mt-2 text-sm font-semibold text-card-foreground">
                {amount} {fromToken} → {toToken}
              </p>
              <p className="text-xs text-muted-foreground">Rate {formatRate(quote?.rate)}{quoteProvider ? ` · ${quoteProvider}` : ""}</p>
              {fallbackReason && <p className="mt-1 text-[11px] text-warning">Fallback: {fallbackReason}</p>}
            </div>

            <div className="rounded-xl bg-background/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Decision
              </div>
              <p className="mt-2 text-sm font-semibold text-card-foreground">
                {decision?.action ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Confidence {formatConfidence(decision?.confidence)}</p>
            </div>

            <div className="rounded-xl bg-background/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Execution
              </div>
              <p className="mt-2 text-sm font-semibold text-card-foreground">
                {executionStatus ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">No funds moved</p>
            </div>

            <div className="rounded-xl bg-background/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Database className="h-3.5 w-3.5" /> Report
              </div>
              <p className="mt-2 break-all text-sm font-semibold text-card-foreground">
                {shortHash(reportUri)}
              </p>
              <p className="text-xs text-muted-foreground">0G / audit pointer</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
