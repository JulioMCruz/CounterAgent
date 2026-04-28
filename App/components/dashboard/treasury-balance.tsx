import { Card, CardContent } from "@/components/ui/card"

export function TreasuryBalance() {
  return (
    <Card className="border-0 bg-header-bg text-header-foreground shadow-lg">
      <CardContent className="px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-header-foreground/60">Total Treasury Balance</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight">$4,654.20</p>
        <p className="mt-1.5 text-sm font-medium text-primary">
          &uarr; +$148.20 saved vs card rails this month
        </p>
      </CardContent>
    </Card>
  )
}
