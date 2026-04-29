import { buildInfo } from "@/lib/build-info"

export function BuildBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-header-foreground/10 px-2 py-1 font-mono text-[10px] font-semibold text-header-foreground/70 ${className}`}
      title={`Commit ${buildInfo.commit} · ${buildInfo.branch} · ${buildInfo.builtAt}`}
    >
      {buildInfo.version}
    </span>
  )
}
