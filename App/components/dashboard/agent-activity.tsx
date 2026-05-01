import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRightLeft, Eye, FileText, Pause, ShieldCheck } from "lucide-react"

import type { DashboardDecision, DashboardExecution, DashboardMonitorEvent, DashboardReport, DashboardState } from "@/lib/a0"

type Activity = {
  id: string
  agent: "A1" | "A2" | "A3" | "A4"
  timestamp: string
  label: string
  detail?: string
  icon: typeof ArrowRightLeft
  iconColor: string
  iconBg: string
}

const agentClass: Record<Activity["agent"], string> = {
  A1: "bg-chart-3/10 text-chart-3",
  A2: "bg-warning/10 text-warning",
  A3: "bg-success/10 text-success",
  A4: "bg-primary/10 text-primary",
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta)) return "just now"
  const minutes = Math.max(0, Math.round(delta / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function monitorActivity(item: DashboardMonitorEvent): Activity {
  return {
    id: `monitor-${item.type}-${item.timestamp}`,
    agent: "A1",
    timestamp: item.timestamp,
    label: item.status === "loaded" ? `Monitor loaded ENS config${item.ensName ? ` for ${item.ensName}` : ""}` : item.summary,
    detail: [item.fxThresholdBps ? `${item.fxThresholdBps} bps` : "", item.riskTolerance, item.preferredStablecoin].filter(Boolean).join(" · ") || item.status,
    icon: Eye,
    iconColor: "text-chart-3",
    iconBg: "bg-chart-3/10",
  }
}

function decisionActivity(item: DashboardDecision): Activity {
  return {
    id: `decision-${item.workflowId ?? item.timestamp}`,
    agent: "A2",
    timestamp: item.timestamp,
    label: item.action === "CONVERT" ? `Decision: convert ${item.amount ?? ""} ${item.fromToken ?? ""}` : "Decision: hold — FX within threshold",
    detail: `${Math.round(item.confidence)}% confidence${typeof item.spreadBps === "number" ? ` · spread ${item.spreadBps} bps` : ""}`,
    icon: item.action === "CONVERT" ? ShieldCheck : Pause,
    iconColor: item.action === "CONVERT" ? "text-success" : "text-warning",
    iconBg: item.action === "CONVERT" ? "bg-success/10" : "bg-warning/10",
  }
}

function executionActivity(item: DashboardExecution): Activity {
  return {
    id: `execution-${item.type}-${item.workflowId ?? item.timestamp}`,
    agent: "A3",
    timestamp: item.timestamp,
    label: item.type === "quote"
      ? `Quoted ${item.amount ?? ""} ${item.fromToken ?? ""}→${item.toToken ?? ""}`
      : `${item.status === "skipped" ? "Skipped" : "Executed dry-run"} ${item.amount ?? ""} ${item.fromToken ?? ""}→${item.toToken ?? ""}`,
    detail: item.rate ? `Rate ${item.rate.toFixed(4)}${item.txHash ? ` · ${item.txHash.slice(0, 10)}…` : ""}` : item.status,
    icon: ArrowRightLeft,
    iconColor: "text-success",
    iconBg: "bg-success/10",
  }
}

function reportActivity(item: DashboardReport): Activity {
  return {
    id: `report-${item.reportId}`,
    agent: "A4",
    timestamp: item.timestamp,
    label: `Report: ${item.decision}`,
    detail: item.storageUri ?? item.summary,
    icon: FileText,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
  }
}

export function AgentActivity({ dashboard, isLoading }: { dashboard?: DashboardState; isLoading?: boolean }) {
  const activities = [
    ...(dashboard?.monitor ?? []).map(monitorActivity),
    ...(dashboard?.decisions ?? []).map(decisionActivity),
    ...(dashboard?.executions ?? []).map(executionActivity),
    ...(dashboard?.reports ?? []).map(reportActivity),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)

  return (
    <Card>
      <CardHeader className="px-5 pb-2 pt-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Agent Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live agent activity…</p>
        ) : activities.length === 0 ? (
          <p className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground">
            No activity yet. Monitor events appear after ENS/session lookup; decision, execution, and reporting events appear after a dry-run.
          </p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.iconBg}`}>
                <a.icon className={`h-4 w-4 ${a.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${agentClass[a.agent]}`}>{a.agent}</span>
                  <p className="text-sm font-medium text-card-foreground">{a.label}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{relativeTime(a.timestamp)}{a.detail ? ` · ${a.detail}` : ""}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
