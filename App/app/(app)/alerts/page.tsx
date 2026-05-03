"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Pause, AlertTriangle, MessageCircle, ArrowRightLeft, FileText, RadioTower } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { fetchAxlStatus, fetchDashboardState, type AxlStatus, type DashboardState } from "@/lib/a0"

const filters = ["All", "Swaps", "Holds", "AXL", "Settings", "Anomalies"] as const

const settingsAxlEventsKey = "counteragent:settings-axl-events"

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
  agent: "A1" | "A2" | "A3" | "A4" | "AXL" | "SET"
}

type SettingsAxlEvent = {
  id: string
  timestamp: string
  kind: "treasury" | "ens"
  phase: string
  fromAgent: string
  toAgent: string
  messageType: string
  transport: string
  ok: boolean
  detail: string
}

const statusStyles: Record<AlertStatus, string> = {
  Success: "bg-success/10 text-success",
  Hold: "bg-warning/10 text-warning-foreground",
  Review: "bg-primary/10 text-primary",
}

const agentStyles: Record<AlertItem["agent"], string> = {
  A1: "bg-secondary text-secondary-foreground",
  A2: "bg-warning/10 text-warning-foreground",
  A3: "bg-success/10 text-success",
  A4: "bg-primary/10 text-primary",
  AXL: "bg-primary/10 text-primary",
  SET: "bg-chart-3/10 text-chart-3",
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

function agentForMessage(message: NonNullable<AxlStatus["recentMessages"]>[number]): AlertItem["agent"] {
  if (message.fromAgent.startsWith("A1-") || message.toAgent.startsWith("A1-")) return "A1"
  if (message.fromAgent.startsWith("A2-") || message.toAgent.startsWith("A2-")) return "A2"
  if (message.fromAgent.startsWith("A3-") || message.toAgent.startsWith("A3-")) return "A3"
  if (message.fromAgent.startsWith("A4-") || message.toAgent.startsWith("A4-")) return "A4"
  return "AXL"
}


function loadSettingsAxlEvents(): SettingsAxlEvent[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(settingsAxlEventsKey) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SettingsAxlEvent => Boolean(item?.id && item?.timestamp && item?.messageType)).slice(0, 40)
  } catch {
    return []
  }
}

function buildSettingsAlerts(events: SettingsAxlEvent[]): AlertItem[] {
  return events.slice(0, 20).map((event): AlertItem => ({
    icon: RadioTower,
    iconColor: event.ok ? "text-chart-3" : "text-destructive",
    iconBg: event.ok ? "bg-chart-3/10" : "bg-destructive/10",
    title: `Settings AXL ${event.kind === "ens" ? "ENS" : "Treasury"}`,
    description: `${event.fromAgent} → ${event.toAgent}\n${event.messageType} · ${event.transport}\n${event.detail}`,
    time: relativeTime(event.timestamp),
    timestamp: event.timestamp,
    status: event.ok ? "Review" : "Hold",
    agent: "SET",
  }))
}

function buildAxlAlerts(axl?: AxlStatus): AlertItem[] {
  return (axl?.recentMessages ?? []).slice(0, 20).map((message): AlertItem => {
    const ok = message.axl?.ok === true
    const transport = message.axl?.transport ?? message.mode
    return {
      icon: RadioTower,
      iconColor: ok ? "text-primary" : "text-destructive",
      iconBg: ok ? "bg-primary/10" : "bg-destructive/10",
      title: `AXL ${message.messageType}`,
      description: `${message.fromAgent} → ${message.toAgent}\n${transport} · workflow ${message.workflowId}`,
      time: relativeTime(message.createdAt),
      timestamp: message.createdAt,
      status: ok ? "Review" : "Hold",
      agent: agentForMessage(message),
    }
  })
}

function buildAlerts(dashboard?: DashboardState, axl?: AxlStatus, settingsEvents: SettingsAxlEvent[] = []): AlertItem[] {
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

  return [...buildSettingsAlerts(settingsEvents), ...buildAxlAlerts(axl), ...decisionAlerts, ...executionAlerts, ...reportAlerts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
}

function matchesFilter(alert: AlertItem, filter: string) {
  if (filter === "All") return true
  if (filter === "Swaps") return alert.agent === "A3"
  if (filter === "Holds") return alert.status === "Hold"
  if (filter === "AXL") return alert.title.startsWith("AXL ") || alert.title.startsWith("Settings AXL ")
  if (filter === "Settings") return alert.title.startsWith("Settings AXL ")
  if (filter === "Anomalies") return alert.status === "Review" && !alert.title.startsWith("AXL ") && !alert.title.startsWith("Settings AXL ")
  return true
}

export default function AlertsPage() {
  const { address } = useConnectedWalletAddress()
  const [filter, setFilter] = useState<string>("All")
  const [settingsEvents, setSettingsEvents] = useState<SettingsAxlEvent[]>([])
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-state", address],
    queryFn: () => fetchDashboardState(address!),
    enabled: Boolean(address),
    refetchInterval: 5_000,
    staleTime: 2_000,
  })
  const axlQuery = useQuery({
    queryKey: ["axl-status"],
    queryFn: fetchAxlStatus,
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  useEffect(() => {
    const refresh = () => setSettingsEvents(loadSettingsAxlEvents())
    refresh()
    const interval = window.setInterval(refresh, 5_000)
    window.addEventListener("storage", refresh)
    window.addEventListener("counteragent:settings-axl-event", refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("storage", refresh)
      window.removeEventListener("counteragent:settings-axl-event", refresh)
    }
  }, [])

  const alerts = useMemo(() => buildAlerts(dashboardQuery.data, axlQuery.data, settingsEvents), [dashboardQuery.data, axlQuery.data, settingsEvents])
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
                <p className="text-xs text-header-foreground/60">Live Decision, Execution, Reporting, Settings, and Gensyn AXL message events</p>
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
            {!address && !axlQuery.data?.recentMessages?.length && settingsEvents.length === 0 ? (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">
                  Connect a registered wallet to see merchant alerts. AXL transport logs appear here as soon as agents exchange messages.
                </CardContent>
              </Card>
            ) : dashboardQuery.isLoading && !axlQuery.data ? (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">Loading live alerts…</CardContent>
              </Card>
            ) : filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert, i) => <AlertCard key={`${alert.agent}-${alert.title}-${i}`} alert={alert} />)
            ) : (
              <Card>
                <CardContent className="px-4 py-4 text-sm text-muted-foreground">
                  No alerts yet. Registration, Settings updates, dashboard lookup, or workflow dry-runs will appear here.
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
