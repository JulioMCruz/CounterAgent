"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Pause, AlertTriangle, MessageCircle, ArrowRightLeft, FileText } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { fetchDashboardState, type DashboardState } from "@/lib/a0"

const filters = ["All", "Swaps", "Holds", "Anomalies"] as const

type AlertStatus = "Success" | "Hold" | "Review"

interface AlertItem {
  icon: typeof CheckCircle2
  iconColor: string
  iconBg: string
  title: string
  description: string
  time: string
  timestamp: string
  status: AlertStatus
  agent: "A2" | "A3" | "A4"
}

const statusStyles: Record<AlertStatus, string> = {
  Success: "bg-success/10 text-success",
  Hold: "bg-warning/10 text-warning-foreground",
  Review: "bg-primary/10 text-primary",
}

const agentStyles: Record<AlertItem["agent"], string> = {
  A2: "bg-warning/10 text-warning-foreground",
  A3: "bg-success/10 text-success",
  A4: "bg-primary/10 text-primary",
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta)) return "just now"
  const minutes = Math.max(0, Math.round(delta / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function buildAlerts(dashboard?: DashboardState): AlertItem[] {
  const decisionAlerts = (dashboard?.decisions ?? []).map((decision): AlertItem => ({
    icon: decision.action === "CONVERT" ? CheckCircle2 : Pause,
    iconColor: decision.action === "CONVERT" ? "text-success" : "text-warning-foreground",
    iconBg: decision.action === "CONVERT" ? "bg-success/10" : "bg-warning/10",
    title: decision.action === "CONVERT" ? "Convert Decision" : "Hold Decision",
    description: `${decision.amount ?? ""} ${decision.fromToken ?? ""} → ${decision.toToken ?? ""}\n${decision.reason ?? `${Math.round(decision.confidence)}% confidence`}`,
    time: relativeTime(decision.timestamp),
    timestamp: decision.timestamp,
    status: decision.action === "CONVERT" ? "Success" : "Hold",
    agent: "A2",
  }))

  const executionAlerts = (dashboard?.executions ?? []).map((execution): AlertItem => ({
    icon: ArrowRightLeft,
    iconColor: execution.status === "skipped" ? "text-warning-foreground" : "text-success",
    iconBg: execution.status === "skipped" ? "bg-warning/10" : "bg-success/10",
    title: execution.type === "quote" ? "Quote Prepared" : execution.status === "skipped" ? "Execution Skipped" : "Dry-run Executed",
    description: `${execution.amount ?? ""} ${execution.fromToken ?? ""} → ${execution.toToken ?? ""}${execution.rate ? ` @ ${execution.rate.toFixed(4)}` : ""}\nStatus: ${execution.status}`,
    time: relativeTime(execution.timestamp),
    timestamp: execution.timestamp,
    status: execution.status === "skipped" ? "Hold" : "Success",
    agent: "A3",
  }))

  const reportAlerts = (dashboard?.reports ?? []).map((report): AlertItem => ({
    icon: FileText,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "Report Published",
    description: `${report.summary}\n${report.storageUri ?? report.contentHash ?? "Audit pointer ready"}`,
    time: relativeTime(report.timestamp),
    timestamp: report.timestamp,
    status: "Review",
    agent: "A4",
  }))

  return [...decisionAlerts, ...executionAlerts, ...reportAlerts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
}

function matchesFilter(alert: AlertItem, filter: string) {
  if (filter === "All") return true
  if (filter === "Swaps") return alert.agent === "A3"
  if (filter === "Holds") return alert.status === "Hold"
  if (filter === "Anomalies") return alert.status === "Review"
  return true
}

export default function AlertsPage() {
  const { address } = useConnectedWalletAddress()
  const [filter, setFilter] = useState<string>("All")
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-state", address],
    queryFn: () => fetchDashboardState(address!),
    enabled: Boolean(address),
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const alerts = useMemo(() => buildAlerts(dashboardQuery.data), [dashboardQuery.data])
  const filteredAlerts = alerts.filter((alert) => matchesFilter(alert, filter))

  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          <Card className="border-0 bg-header-bg text-header-foreground lg:flex-1">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-3/20">
                <MessageCircle className="h-5 w-5 text-chart-3" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Agent Alerts</p>
                <p className="text-xs text-header-foreground/60">Live events from A2/A3/A4 for the connected merchant</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Live
              </span>
            </CardContent>
          </Card>

          <div className="flex items-center gap-1 rounded-xl bg-secondary p-1 lg:w-auto lg:shrink-0">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition-colors lg:flex-none lg:px-5 ${
                  filter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Live Events</p>
          <div className="flex flex-col gap-2">
            {!address ? (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">
                  Connect a registered wallet to see agent alerts.
                </CardContent>
              </Card>
            ) : dashboardQuery.isLoading ? (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">Loading live alerts…</CardContent>
              </Card>
            ) : filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert, i) => <AlertCard key={`${alert.agent}-${alert.title}-${i}`} alert={alert} />)
            ) : (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">
                  No alerts yet. Run a dry-run from Dashboard and A2/A3/A4 events will appear here.
                </CardContent>
              </Card>
            )}
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${agentStyles[alert.agent]}`}>{alert.agent}</span>
              <p className="text-sm font-bold text-card-foreground">{alert.title}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyles[alert.status]}`}>{alert.status}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{alert.description}</p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">{alert.time}</p>
        </div>
      </CardContent>
    </Card>
  )
}
