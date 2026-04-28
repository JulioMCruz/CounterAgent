"use client"

import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer } from "recharts"

const periods = ["7D", "1M", "3M", "All"] as const

const chartData = [
  { week: "W1", saved: 22 },
  { week: "W2", saved: 38 },
  { week: "W3", saved: 52 },
  { week: "W4", saved: 28 },
  { week: "W5", saved: 8 },
]

const stats = [
  { label: "Total Saved", value: "$148.20", sublabel: "vs card rails" },
  { label: "Volume Processed", value: "$42.8k", sublabel: "this month" },
  { label: "Swaps Executed", value: "21", sublabel: "avg 0.35% saved" },
  { label: "Best Rate", value: "1.0847", sublabel: "EURC/USDC" },
]

const tradingPairs = [
  { pair: "EURC \u2192 USDC", volume: "Vol: $28,400", swaps: "14 swaps", saved: "$98.40" },
  { pair: "USDT \u2192 USDC", volume: "Vol: $14,400", swaps: "7 swaps", saved: "$49.80" },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<string>("1M")

  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        {/* Period Tabs */}
        <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-1 rounded-xl bg-secondary p-1 lg:max-w-md">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                period === p
                  ? "bg-card text-card-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Desktop: chart + trading pairs side by side */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
          {/* Chart Card - takes 2 cols */}
          <Card className="lg:col-span-2">
            <CardContent className="px-4 py-4 lg:px-6 lg:py-6">
              <p className="mb-1 text-sm font-bold text-card-foreground lg:text-base">Savings vs Card Rails</p>
              <p className="mb-4 text-xs text-muted-foreground">USD saved per week this month</p>
              <div className="h-40 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="20%">
                    <XAxis
                      dataKey="week"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis hide />
                    <Bar dataKey="saved" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Trading Pairs - takes 1 col */}
          <Card>
            <CardContent className="px-4 py-4 lg:px-5 lg:py-5">
              <p className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">By Trading Pair</p>
              <div className="flex flex-col gap-4">
                {tradingPairs.map((tp) => (
                  <div key={tp.pair} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-card-foreground">{tp.pair}</p>
                      <p className="text-xs text-muted-foreground">{tp.volume} &middot; {tp.swaps}</p>
                    </div>
                    <span className="text-sm font-bold text-success">{tp.saved}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid - 2 cols on mobile, 4 on desktop */}
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
