import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function MonthlySavings() {
  return (
    <Card>
      <CardHeader className="px-5 pb-1 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Monthly Savings</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <p className="text-sm text-muted-foreground">Saved vs card rails</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-card-foreground">$148.20</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Volume: $42,800 &middot; 21 swaps &middot; Avg 0.35%
        </p>
      </CardContent>
    </Card>
  )
}
