import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardState } from "@/lib/a0"

function money(value?: string | number) {
  const amount = typeof value === "number" ? value : Number(value ?? 0)
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

function weeklySavings(dashboard?: DashboardState) {
  const buckets = new Map<string, number>()
  for (const execution of dashboard?.executions ?? []) {
    if (execution.type !== "execution" || execution.status === "skipped") continue
    const date = new Date(execution.timestamp)
    const week = `W${Math.ceil(date.getDate() / 7)}`
    buckets.set(week, (buckets.get(week) ?? 0) + Number(execution.amount ?? 0) * 0.0035)
  }
  return Array.from(buckets.entries()).slice(-4)
}

export function MonthlySavings({ dashboard, isLoading }: { dashboard?: DashboardState; isLoading?: boolean }) {
  const savings = weeklySavings(dashboard)
  const max = Math.max(...savings.map(([, value]) => value), 1)

  return (
    <Card>
      <CardHeader className="px-5 pb-1 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Monthly Savings</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <p className="text-sm text-muted-foreground">Saved vs card rails</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-card-foreground">
          {isLoading ? "Loading…" : money(dashboard?.kpis.totalSavedUsd)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Volume: {money(dashboard?.kpis.volumeUsd)} · {dashboard?.kpis.swapsExecuted ?? 0} swaps · Live A0 aggregate
        </p>

        {savings.length > 0 ? (
          <div className="mt-4 flex h-20 items-end gap-2">
            {savings.map(([week, value]) => (
              <div key={week} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(10, (value / max) * 72)}px` }} />
                <span className="text-[10px] text-muted-foreground">{week}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground">
            No execution history yet. The chart will populate from A3 executions after dry-runs.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
