"use client"

import { Zap } from "lucide-react"
import { SessionHeaderActions } from "@/components/session-header-actions"

interface AppHeaderProps {
  showStatus?: boolean
  statusLabel?: string
  networkLabel?: string
}

export function AppHeader({ showStatus = true, statusLabel = "Active", networkLabel = "Base" }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between bg-header-bg px-4 py-3 text-header-foreground lg:rounded-xl lg:mx-0">
      {/* Logo visible on mobile, hidden on desktop (sidebar has it) */}
      <div className="flex items-center gap-2 lg:hidden">
        <Zap className="h-5 w-5 text-primary" fill="currentColor" />
        <span className="text-lg font-bold tracking-tight">Counter Agent</span>
      </div>
      {/* Desktop: show page context area */}
      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-sm font-medium text-header-foreground/70">Treasury Overview</span>
      </div>
      <div className="flex items-center gap-3">
        {showStatus && (
          <>
            <div className="flex items-center gap-1.5 rounded-full bg-header-foreground/10 px-2.5 py-1 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span>{statusLabel}</span>
            </div>
            <span className="hidden text-xs font-medium text-header-foreground/70 sm:inline">{networkLabel}</span>
          </>
        )}
        <SessionHeaderActions />
      </div>
    </header>
  )
}
