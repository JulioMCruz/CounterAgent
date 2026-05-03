import { BadgeCheck, BrainCircuit, Coins, ExternalLink, FileCheck2, Network, Radar } from "lucide-react"

const ensRecordUrl = (name: string) => `https://sepolia.app.ens.domains/${name}?tab=records`

const agentEnsIdentities = [
  {
    role: "Treasury Orchestrator",
    ens: "orchestrator.counteragents.eth",
    service: "counteragent-orchestrator",
    proof: "Coordinates policy, route, execution, and reporting handoffs",
    icon: Network,
  },
  {
    role: "ENS Monitor",
    ens: "monitor.counteragents.eth",
    service: "counteragent-monitor",
    proof: "Reads merchant ENS config and emits threshold signals",
    icon: Radar,
  },
  {
    role: "Risk Decision Engine",
    ens: "decision.counteragents.eth",
    service: "counteragent-decision",
    proof: "Scores route quality, policy fit, risk, and confidence",
    icon: BrainCircuit,
  },
  {
    role: "Uniswap Execution Agent",
    ens: "execution.counteragents.eth",
    service: "counteragent-execution",
    proof: "Publishes quote, approval, route, and swap capabilities",
    icon: Coins,
  },
  {
    role: "Proof Reporting Agent",
    ens: "reporting.counteragents.eth",
    service: "counteragent-reporting",
    proof: "Anchors report pointers, content hashes, and alerts",
    icon: FileCheck2,
  },
]

export function AgentEnsMesh() {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <BadgeCheck className="h-4 w-4" /> ENS Agent Identity Mesh
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">ENS-resolved agent roles, wallets, capabilities, and proofs.</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Compact identity cards keep the dashboard dense; hover or focus a role to reveal its service record and proof.
          </p>
        </div>
        <div className="w-fit rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
          <div className="font-semibold">Merchant record</div>
          <div className="font-mono text-[11px]">counteragent.agent_mesh</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {agentEnsIdentities.map((agent) => {
          const Icon = agent.icon
          return (
            <div
              key={agent.ens}
              tabIndex={0}
              className="group relative h-28 rounded-2xl border border-border bg-background/70 p-3 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:-translate-y-0.5 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{agent.role}</div>
                  <a
                    href={ensRecordUrl(agent.ens)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <span className="truncate">{agent.ens}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-2 top-[calc(100%-0.5rem)] z-20 rounded-2xl border border-primary/20 bg-background/95 p-3 opacity-0 shadow-xl backdrop-blur transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-1 group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:translate-y-1 group-focus-visible:opacity-100">
                <div className="rounded-full bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{agent.service}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{agent.proof}</p>
                <a
                  href={ensRecordUrl(agent.ens)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  View ENS records <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
