"use client"

import { useMemo, useState } from "react"
import { ArrowRightLeft, CheckCircle2, Database, Loader2, Play, ShieldCheck } from "lucide-react"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { evaluateWorkflow, type WorkflowEvaluateResponse } from "@/lib/a0"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const defaultAmount = "800"
const defaultFromToken = "EURC"
const defaultToToken = "USDC"

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

  const workflowId = useMemo(() => {
    if (!address) return undefined
    return `dashboard-${address.slice(2, 10).toLowerCase()}-${Date.now()}`
  }, [address])

  async function runWorkflow() {
    if (!address) {
      setError("Connect a wallet to run the workflow.")
      return
    }

    setIsRunning(true)
    setError(null)

    try {
      const response = await evaluateWorkflow({
        workflowId,
        merchantEns: "dashboard.counteragent.eth",
        walletAddress: address,
        chainId: chainId ?? 8453,
        fromToken: defaultFromToken,
        toToken: defaultToToken,
        amount: defaultAmount,
        fxThresholdBps: 50,
        riskTolerance: "moderate",
        baselineRate: 1.07,
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

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Live Agent Workflow
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs Orchestration Agent → Execution Agent quote → Decision Agent → Execution Agent dry-run → Reporting Agent.
          </p>
        </div>
        <Button type="button" onClick={runWorkflow} disabled={isRunning || !address} size="sm">
          {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
          {isRunning ? "Running" : "Run dry-run"}
        </Button>
      </CardHeader>
      <CardContent className="px-5 pb-5">
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
                {defaultAmount} {defaultFromToken} → {defaultToToken}
              </p>
              <p className="text-xs text-muted-foreground">Rate {formatRate(quote?.rate)}</p>
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
