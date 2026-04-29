import Link from "next/link"
import { Zap, ArrowRightLeft, FileText, Radio, MessageCircle } from "lucide-react"
import { ConnectAndRoute } from "@/components/connect-and-route"
import { SessionHeaderActions } from "@/components/session-header-actions"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-header-bg">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-8 lg:py-5">
        <div className="flex items-center gap-2 text-header-foreground">
          <Zap className="h-5 w-5 text-primary lg:h-6 lg:w-6" fill="currentColor" />
          <span className="text-lg font-bold tracking-tight lg:text-xl">Counter Agent</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/onboarding" className="text-sm font-medium text-header-foreground/70 hover:text-header-foreground">
            For Merchants
          </Link>
          <SessionHeaderActions />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-8 lg:flex lg:items-center lg:gap-16 lg:px-8 lg:pb-20 lg:pt-20">
        {/* Left column */}
        <div className="lg:flex-1">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Base Network &middot; Live
          </div>
          <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight text-header-foreground lg:text-6xl lg:leading-[1.1]">
            Get Paid in<br />
            <span className="text-primary">Any Stablecoin.</span><br />
            Keep the Best Rate.
          </h1>
          <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-header-foreground/60 lg:mt-6 lg:text-lg">
            CounterAgent monitors FX rates and auto-converts your USDC &middot; EURC &middot; USDT &mdash; so you never lose value to bad timing.
          </p>
          <div className="mt-8 lg:mt-10">
            <ConnectAndRoute />
          </div>

          {/* Powered By */}
          <div className="mt-10 lg:mt-14">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-header-foreground/40">Powered by</p>
            <div className="flex flex-wrap items-center gap-3">
              {["Base", "ENS", "Uniswap", "KeeperHub", "OG"].map((name) => (
                <span key={name} className="rounded-full bg-header-foreground/10 px-3 py-1.5 text-xs font-medium text-header-foreground/70">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right column - feature cards (visible on desktop as a grid, stacked below on mobile) */}
        <div className="mt-10 lg:mt-0 lg:w-[440px] lg:shrink-0">
          <div className="rounded-3xl bg-background p-6 lg:p-8">
            <h2 className="mb-4 text-lg font-bold text-foreground lg:text-xl">How it works</h2>
            <div className="grid grid-cols-2 gap-3">
              <FeatureCard
                icon={<ArrowRightLeft className="h-5 w-5 text-primary" />}
                title="Auto-Convert"
                description="FX-triggered swaps via Uniswap v3"
              />
              <FeatureCard
                icon={<FileText className="h-5 w-5 text-warning" />}
                title="ENS Config"
                description="Set once. Stored in your ENS record."
              />
              <FeatureCard
                icon={<Radio className="h-5 w-5 text-success" />}
                title="OG Audit Log"
                description="Every decision permanently on-chain."
              />
              <FeatureCard
                icon={<MessageCircle className="h-5 w-5 text-chart-3" />}
                title="Telegram Alerts"
                description="Instant swap & anomaly alerts."
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
