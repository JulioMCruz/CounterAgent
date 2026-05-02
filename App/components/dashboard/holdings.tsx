import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardState } from "@/lib/a0"

const tokenMeta: Record<string, { name: string; color: string }> = {
  USDC: { name: "USD Coin", color: "bg-chart-3" },
  EURC: { name: "Euro Coin", color: "bg-primary" },
  USDT: { name: "Tether", color: "bg-success" },
  CUSD: { name: "Mento Dollar", color: "bg-chart-2" },
  CEUR: { name: "Mento Euro", color: "bg-chart-4" },
  CELO: { name: "Celo", color: "bg-chart-5" },
}

function formatAmount(value: number, symbol: string) {
  if (!value) return "No activity"
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`
}

export function Holdings({ dashboard, isLoading }: { dashboard?: DashboardState; isLoading?: boolean }) {
  const tokenTotals = new Map<string, number>()

  for (const execution of dashboard?.executions ?? []) {
    if (execution.type !== "execution" || execution.status === "skipped") continue
    if (execution.fromToken) tokenTotals.set(execution.fromToken, (tokenTotals.get(execution.fromToken) ?? 0) + Number(execution.amount ?? 0))
    if (execution.toToken) tokenTotals.set(execution.toToken, tokenTotals.get(execution.toToken) ?? 0)
  }

  const holdings = ["USDC", "EURC", "USDT", "CUSD", "CEUR", "CELO"].map((symbol) => ({
    symbol,
    name: tokenMeta[symbol]?.name ?? symbol,
    value: tokenTotals.get(symbol) ?? 0,
    color: tokenMeta[symbol]?.color ?? "bg-muted-foreground",
  }))

  return (
    <Card>
      <CardHeader className="px-5 pb-2 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Holdings Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live agent data…</p>
        ) : holdings.every((h) => h.value === 0) ? (
          <p className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground">
            No swap history yet. Registered merchants start empty until A3 quotes or executes a dry-run.
          </p>
        ) : (
          holdings.map((h) => (
            <div key={h.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${h.color}`} />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">{h.symbol}</p>
                  <p className="text-xs text-muted-foreground">{h.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-card-foreground">{formatAmount(h.value, h.symbol)}</p>
                <p className="text-xs font-medium text-muted-foreground">A3 history</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
