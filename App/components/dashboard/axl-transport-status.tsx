"use client"

import { useQuery } from "@tanstack/react-query"
import { Network, RadioTower, ShieldCheck, TriangleAlert } from "lucide-react"
import { fetchAxlStatus } from "@/lib/a0"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function label(value?: boolean) {
  return value ? "ready" : "missing"
}

export function AxlTransportStatus() {
  const statusQuery = useQuery({
    queryKey: ["axl-status"],
    queryFn: fetchAxlStatus,
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const status = statusQuery.data
  const recent = status?.recentMessages?.slice(0, 3) ?? []
  const isTransport = status?.mode === "transport"
  const hasIssue = statusQuery.isError || status?.topologyError

  return (
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Network className="h-4 w-4" /> Gensyn AXL Transport
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Live connection between A0 and agent services through the configured exchange layer.
          </p>
        </div>
        <Badge variant={isTransport ? "default" : "secondary"}>{status?.mode ?? "checking"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {hasIssue && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="h-4 w-4" /> {status?.topologyError ?? "AXL status is unavailable"}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-background/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Node</p>
            <p className="mt-1 text-sm font-semibold">{label(status?.nodeConfigured)}</p>
          </div>
          <div className="rounded-xl bg-background/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">A2 peer</p>
            <p className="mt-1 text-sm font-semibold">{label(status?.peers?.A2)}</p>
          </div>
          <div className="rounded-xl bg-background/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">A3 peer</p>
            <p className="mt-1 text-sm font-semibold">{label(status?.peers?.A3)}</p>
          </div>
          <div className="rounded-xl bg-background/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HTTP fallback</p>
            <p className="mt-1 text-sm font-semibold">{status?.fallbackToHttp === false ? "off" : "on"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <RadioTower className="h-3.5 w-3.5" /> Recent AXL messages
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet. Run the workflow dry-run to generate traffic.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((message) => (
                <div key={message.messageId} className="flex flex-col gap-1 rounded-lg bg-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium text-card-foreground">{message.fromAgent} → {message.toAgent}</span>
                  <span className="text-muted-foreground">{message.messageType}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" /> {message.axl?.ok ? message.axl.transport ?? "sent" : message.axl?.error ?? message.mode}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
