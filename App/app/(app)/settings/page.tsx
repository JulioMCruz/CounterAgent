"use client"

import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Wallet,
  FileText,
  TrendingUp,
  Shield,
  Coins,
  MessageCircle,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Link2,
} from "lucide-react"

const treasuryConfig = [
  { icon: FileText, label: "ENS Config", value: "yourname.eth", color: "text-warning-foreground", bg: "bg-warning/10" },
  { icon: TrendingUp, label: "FX Threshold", value: "0.5% minimum spread", color: "text-chart-3", bg: "bg-chart-3/10" },
  { icon: Shield, label: "Risk Tolerance", value: "Moderate", color: "text-success", bg: "bg-success/10" },
  { icon: Coins, label: "Preferred Stablecoin", value: "USDC", color: "text-primary", bg: "bg-primary/10" },
]

export default function SettingsPage() {
  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        {/* Merchant Wallet - full width */}
        <Card className="border-0 bg-header-bg text-header-foreground">
          <CardContent className="flex items-center gap-3 px-4 py-4 lg:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold lg:text-base">Merchant Wallet</p>
              <p className="font-mono text-xs text-header-foreground/60">0x4a3b...9f2e &middot; Base</p>
            </div>
            <span className="rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-success">Connected</span>
          </CardContent>
        </Card>

        {/* Desktop: two-column layout for config sections */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
          {/* Treasury Config */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Treasury Config</p>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                {treasuryConfig.map((item) => (
                  <button
                    key={item.label}
                    className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 lg:px-5"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.value}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Notifications + Integrations */}
          <div className="flex flex-col gap-4 lg:gap-6">
            {/* Notifications */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Notifications</p>
              <Card>
                <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-3/10">
                      <MessageCircle className="h-4 w-4 text-chart-3" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Telegram Alerts</p>
                      <p className="text-xs text-muted-foreground">@merchantchat</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Anomaly Alerts</p>
                      <p className="text-xs text-muted-foreground">Critical events only</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <CalendarDays className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Weekly Summary</p>
                      <p className="text-xs text-muted-foreground">Every Monday 9am</p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Integrations */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Integrations</p>
              <Card>
                <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                  {["Uniswap v3", "ENS Records", "OG Protocol"].map((name) => (
                    <div key={name} className="flex items-center gap-3 px-4 py-3 lg:px-5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-card-foreground">{name}</p>
                      </div>
                      <span className="text-xs font-medium text-success">Active</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
