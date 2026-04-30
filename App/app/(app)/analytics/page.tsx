"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAccount } from "wagmi"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { fetchDashboardState, type DashboardState } from "@/lib/a0"

const periods = ["7D", "1M", "3M", "All"] as const

function money(value?: string | number) {
  const amount = typeof value === "number" ? value : Number(value ?? 0)
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
}

function compactMoney(value?: string | number) {
  const amount = typeof value === "number" ? value : Number(value ?? 0)
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })
}

function weeklySavings(dashboard?: DashboardState) {
  const buckets = new Map<string, number>()
  for (const execution of dashboard?.executions ?? []) {
    if (execution.type !== "execution" || execution.status === "skipped") continue
    const date = new Date(execution.timestamp)
    const week = `W${Math.ceil(date.getDate() / 7)}`
    buckets.set(week, (buckets.get(week) ?? 0) + Number(execution.amount ?? 0) * 0.0035)
  }
  return Array.from(buckets.entries()).map(([week, saved]) => ({ week, saved: Number(saved.toFixed(2)) }))
}

function tradingPairs(dashboard?: DashboardState) {
  const pairs = new Map<string, { volume: number; swaps: number; saved: number }>()
  for (const execution of dashboard?.executions ?? []) {
    if (execution.type !== "execution" || execution.status === "skipped") continue
    const pair = `${execution.fromToken ?? "?"} → ${execution.toToken ?? "?"}`
    const current = pairs.get(pair) ?? { volume: 0, swaps: 0, saved: 0 }
    const amount = Number(execution.amount ?? 0)
    pairs.set(pair, { volume: current.volume + amount, swaps: current.swaps + 1, saved: current.saved + amount * 0.0035 })
  }
  return Array.from(pairs.entries()).map(([pair, stats]) => ({ pair, ...stats }))
}

export default function AnalyticsPage() {
  const { address } = useAccount()
  const [period, setPeriod] = useState<string>("1M")
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-state", address],
    queryFn: () => fetchDashboardState(address!),
    enabled: Boolean(address),
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const dashboard = dashboardQuery.data
  const chartData = useMemo(() => weeklySavings(dashboard), [dashboard])
  const pairs = useMemo(() => tradingPairs(dashboard), [dashboard])
  const bestRate = dashboard?.executions.reduce((best, execution) => Math.max(best, execution.rate ?? 0), 0) ?? 0
  const stats = [
    { label: "Total Saved", value: money(dashboard?.kpis.totalSavedUsd), sublabel: "vs card rails" },
    { label: "Volume Processed", value: compactMoney(dashboard?.kpis.volumeUsd), sublabel: "live A0 aggregate" },
    { label: "Swaps Executed", value: `${dashboard?.kpis.swapsExecuted ?? 0}`, sublabel: "from A3 executions" },
    { label: "Best Rate", value: bestRate ? bestRate.toFixed(4) : "—", sublabel: "from recent quotes" },
  ]

  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-1 rounded-xl bg-secondary p-1 lg:max-w-md">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                period === p ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {!address && (
          <Card>
            <CardContent className="px-4 py-4 text-sm text-muted-foreground">
              Connect a registered wallet to see live analytics from A0/A2/A3/A4.
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
          <Card className="lg:col-span-2">
            <CardContent className="px-4 py-4 lg:px-6 lg:py-6">
              <p className="mb-1 text-sm font-bold text-card-foreground lg:text-base">Savings vs Card Rails</p>
              <p className="mb-4 text-xs text-muted-foreground">USD saved per week from recent A3 executions</p>
              {dashboardQuery.isLoading ? (
                <p className="h-40 text-sm text-muted-foreground lg:h-64">Loading live analytics…</p>
              ) : chartData.length > 0 ? (
                <div className="h-40 lg:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="20%">
                      <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                      <YAxis hide />
                      <Bar dataKey="saved" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-sm text-muted-foreground">
                  No execution history yet. Run a dry-run from Dashboard to populate this chart.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-4 py-4 lg:px-5 lg:py-5">
              <p className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">By Trading Pair</p>
              {pairs.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {pairs.map((tp) => (
                    <div key={tp.pair} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">{tp.pair}</p>
                        <p className="text-xs text-muted-foreground">Vol: {money(tp.volume)} · {tp.swaps} swaps</p>
                      </div>
                      <span className="text-sm font-bold text-success">{money(tp.saved)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground">
                  No trading-pair history yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-xl font-extrabold tracking-tight text-card-foreground lg:text-2xl">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.sublabel}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
