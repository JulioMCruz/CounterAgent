import { buildInfo } from "@/lib/build-info"

export function BuildBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border border-border bg-background px-2 py-1 font-mono text-[10px] font-semibold text-foreground shadow-sm ${className}`}
      title={`Commit ${buildInfo.commit} · ${buildInfo.branch} · ${buildInfo.builtAt}${buildInfo.deployId ? ` · deploy ${buildInfo.deployId}` : ""}`}
    >
      {buildInfo.version}
    </span>
  )
}
