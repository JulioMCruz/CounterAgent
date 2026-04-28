import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const holdings = [
  { symbol: "USDC", name: "USD Coin", value: "$2,100.00", change: "+0.02%", color: "bg-chart-3" },
  { symbol: "EURC", name: "Euro Coin", value: "\u20AC1,480.00", change: "+1.14%", color: "bg-primary" },
  { symbol: "USDT", name: "Tether", value: "$1,074.20", change: "+0.01%", color: "bg-success" },
]

export function Holdings() {
  return (
    <Card>
      <CardHeader className="px-5 pb-2 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Holdings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-5">
        {holdings.map((h) => (
          <div key={h.symbol} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${h.color}`} />
              <div>
                <p className="text-sm font-semibold text-card-foreground">{h.symbol}</p>
                <p className="text-xs text-muted-foreground">{h.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-card-foreground">{h.value}</p>
              <p className="text-xs font-medium text-success">{h.change}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
