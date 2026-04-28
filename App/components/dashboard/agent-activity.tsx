import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRightLeft, Pause } from "lucide-react"

const activities = [
  {
    icon: ArrowRightLeft,
    iconColor: "text-success",
    iconBg: "bg-success/10",
    label: "Swapped 800 EURC\u2192USDC @ 1.0812",
    time: "2m ago",
  },
  {
    icon: Pause,
    iconColor: "text-warning",
    iconBg: "bg-warning/10",
    label: "Held \u2014 FX within threshold",
    time: "18m ago",
  },
]

export function AgentActivity() {
  return (
    <Card>
      <CardHeader className="px-5 pb-2 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Agent Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-5">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.iconBg}`}>
              <a.icon className={`h-4 w-4 ${a.iconColor}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-card-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.time}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
