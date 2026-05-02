import { BadgeCheck, BrainCircuit, Coins, FileCheck2, Network, Radar } from "lucide-react"

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
    <section className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            <BadgeCheck className="h-4 w-4" /> ENS Agent Identity Mesh
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Role names, wallets, capabilities, and proofs resolve from ENS.</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            CounterAgent uses ENS as a live service registry, not just labels. Each role gets its own subname, wallet address,
            capability record, endpoint pointer, and audit metadata so agents can discover and verify each other without a central table.
          </p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          <div className="font-semibold">Merchant record</div>
          <div className="font-mono text-xs">counteragent.agent_mesh</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {agentEnsIdentities.map((agent) => {
          const Icon = agent.icon
          return (
            <div key={agent.ens} className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold">{agent.role}</div>
              <div className="mt-1 break-all font-mono text-xs text-primary">{agent.ens}</div>
              <div className="mt-2 rounded-full bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{agent.service}</div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{agent.proof}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
