import { Card, CardContent } from "@/components/ui/card"
import type { DashboardState } from "@/lib/a0"

function money(value?: string | number) {
  const amount = typeof value === "number" ? value : Number(value ?? 0)
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

export function TreasuryBalance({ dashboard, isLoading }: { dashboard?: DashboardState; isLoading?: boolean }) {
  const volume = Number(dashboard?.kpis.volumeUsd ?? 0)
  const saved = dashboard?.kpis.totalSavedUsd ?? "0"

  return (
    <Card className="border-0 bg-header-bg text-header-foreground shadow-lg">
      <CardContent className="px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-header-foreground/60">Total Treasury Volume</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight">{isLoading ? "Loading…" : money(volume)}</p>
        <p className="mt-1.5 text-sm font-medium text-primary">
          {Number(saved) > 0 ? `↑ ${money(saved)} saved vs card rails` : "No savings history yet — run a dry-run to populate live data"}
        </p>
      </CardContent>
    </Card>
  )
}
