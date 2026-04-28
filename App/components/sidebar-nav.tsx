"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, BarChart3, Bell, Settings, Zap } from "lucide-react"

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-card" role="navigation" aria-label="Main navigation">
      <div className="flex items-center gap-2 px-6 py-5">
        <Zap className="h-6 w-6 text-primary" fill="currentColor" />
        <span className="text-xl font-bold tracking-tight text-foreground">Counter Agent</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">Powered by Base Network</p>
      </div>
    </aside>
  )
}
