"use client"

import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Pause, AlertTriangle, MessageCircle } from "lucide-react"

const filters = ["All", "Swaps", "Holds", "Anomalies"] as const

type AlertStatus = "Success" | "Hold" | "Review"

interface AlertItem {
  icon: typeof CheckCircle2
  iconColor: string
  iconBg: string
  title: string
  description: string
  time: string
  status: AlertStatus
}

const statusStyles: Record<AlertStatus, string> = {
  Success: "bg-success/10 text-success",
  Hold: "bg-warning/10 text-warning-foreground",
  Review: "bg-primary/10 text-primary",
}

const todayAlerts: AlertItem[] = [
  {
    icon: CheckCircle2,
    iconColor: "text-success",
    iconBg: "bg-success/10",
    title: "Swap Executed",
    description: "800 EURC \u2192 USDC @ 1.0812\nSaved $4.20 \u00B7 Fee: 0.05%",
    time: "2 min ago",
    status: "Success",
  },
  {
    icon: Pause,
    iconColor: "text-warning-foreground",
    iconBg: "bg-warning/10",
    title: "Hold Decision",
    description: "Rate 1.0788 below 0.5% threshold.\nMonitoring.",
    time: "18 min ago",
    status: "Hold",
  },
  {
    icon: CheckCircle2,
    iconColor: "text-success",
    iconBg: "bg-success/10",
    title: "Swap Executed",
    description: "500 USDT \u2192 USDC @ 1.0003\nSaved $1.50 \u00B7 Fee: 0.01%",
    time: "1 hr ago",
    status: "Success",
  },
]

const yesterdayAlerts: AlertItem[] = [
  {
    icon: AlertTriangle,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "Anomaly Detected",
    description: "FX spike +2.1% \u2014 holding for review.\nAgent 0 paused execution.",
    time: "Yesterday 14:32",
    status: "Review",
  },
  {
    icon: CheckCircle2,
    iconColor: "text-success",
    iconBg: "bg-success/10",
    title: "Swap Executed",
    description: "1,200 EURC \u2192 USDC @ 1.0847\nSaved $10.18 \u00B7 Best rate this month",
    time: "Yesterday 09:15",
    status: "Success",
  },
]

export default function AlertsPage() {
  const [filter, setFilter] = useState<string>("All")

  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        {/* Top row: Telegram Banner + Filter Tabs side by side on desktop */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          {/* Telegram Banner */}
          <Card className="border-0 bg-header-bg text-header-foreground lg:flex-1">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-3/20">
                <MessageCircle className="h-5 w-5 text-chart-3" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Telegram Connected</p>
                <p className="text-xs text-header-foreground/60">Alerts sent to @merchantchat</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Live
              </span>
            </CardContent>
          </Card>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-secondary p-1 lg:w-auto lg:shrink-0">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition-colors lg:flex-none lg:px-5 ${
                  filter === f
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Alert groups: side by side on desktop */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-6">
          {/* Today */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Today</p>
            <div className="flex flex-col gap-2">
              {todayAlerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          </div>

          {/* Yesterday */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Yesterday</p>
            <div className="flex flex-col gap-2">
              {yesterdayAlerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function AlertCard({ alert }: { alert: AlertItem }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-3 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${alert.iconBg}`}>
          <alert.icon className={`h-4 w-4 ${alert.iconColor}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-card-foreground">{alert.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyles[alert.status]}`}>
              {alert.status}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{alert.description}</p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">{alert.time}</p>
        </div>
      </CardContent>
    </Card>
  )
}
