"use client"

import { memo, useMemo } from "react"
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { Bot, CheckCircle2, CircleDashed, Database, FileText, KeyRound, Link2, PlugZap, ShieldCheck, Wallet } from "lucide-react"

type FlowMode = "ens-profile-update" | "treasury-config-update"
type FlowPhase = "idle" | "preparing" | "switching" | "confirming" | "mining" | "success" | "error"

type AgentNodeData = {
  label: string
  role: string
  plugins?: string[]
  status: "pending" | "active" | "complete" | "error"
  icon: keyof typeof iconMap
}

const iconMap = {
  bot: Bot,
  wallet: Wallet,
  ens: Link2,
  ipfs: PlugZap,
  registry: Database,
  report: FileText,
  security: ShieldCheck,
  key: KeyRound,
}

const statusStyles = {
  pending: "border-border bg-background text-muted-foreground",
  active: "border-primary/70 bg-primary/10 text-foreground shadow-[0_0_30px_rgba(236,72,153,0.20)]",
  complete: "border-success/60 bg-success/10 text-foreground",
  error: "border-destructive/70 bg-destructive/10 text-foreground",
}

const statusIcon = {
  pending: CircleDashed,
  active: PlugZap,
  complete: CheckCircle2,
  error: CircleDashed,
}

const AgentNode = memo(({ data }: NodeProps<Node<AgentNodeData>>) => {
  const Icon = iconMap[data.icon]
  const StatusIcon = statusIcon[data.status]

  return (
    <div className={`min-w-[178px] rounded-2xl border px-3 py-3 backdrop-blur ${statusStyles[data.status]}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary" />
      <div className="flex items-start gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${data.status === "active" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-black tracking-tight">{data.label}</p>
            <StatusIcon className={`h-3.5 w-3.5 ${data.status === "active" ? "animate-pulse text-primary" : data.status === "complete" ? "text-success" : "text-muted-foreground"}`} />
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{data.role}</p>
        </div>
      </div>
      {data.plugins?.length ? (
        <div className="mt-3 grid gap-1">
          {data.plugins.map((plugin) => (
            <div key={plugin} className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              <PlugZap className="h-3 w-3 text-primary" />
              <span className="truncate">{plugin}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
})
AgentNode.displayName = "AgentNode"

const nodeTypes = { agent: AgentNode }

const phaseIndex = (phase: FlowPhase, mode: FlowMode) => {
  if (phase === "error") return 99
  if (phase === "success") return 99
  if (mode === "ens-profile-update") {
    if (phase === "preparing") return 0
    if (phase === "switching") return 2
    if (phase === "confirming") return 3
    if (phase === "mining") return 4
    return -1
  }
  if (phase === "preparing") return 0
  if (phase === "switching") return 1
  if (phase === "confirming") return 2
  if (phase === "mining") return 3
  return -1
}

const statusFor = (index: number, activeIndex: number, phase: FlowPhase) => {
  if (phase === "error" && index === activeIndex) return "error" as const
  if (phase === "success") return "complete" as const
  if (activeIndex === index) return "active" as const
  if (activeIndex > index) return "complete" as const
  return "pending" as const
}

const buildEnsFlow = (phase: FlowPhase) => {
  const active = phaseIndex(phase, "ens-profile-update")
  const nodes: Node<AgentNodeData>[] = [
    {
      id: "orchestration",
      type: "agent",
      position: { x: 0, y: 58 },
      data: {
        label: "Orchestration Agent",
        role: "Coordinates request",
        plugins: ["CounterAgent Plugin"],
        status: statusFor(0, active, phase),
        icon: "bot",
      },
    },
    {
      id: "monitor",
      type: "agent",
      position: { x: 255, y: 58 },
      data: {
        label: "ENS Monitor Agent",
        role: "Prepares ENS records",
        plugins: ["ENS MerchantConfig"],
        status: statusFor(1, active, phase),
        icon: "ens",
      },
    },
    {
      id: "ipfs",
      type: "agent",
      position: { x: 510, y: 0 },
      data: {
        label: "IPFS Plugin",
        role: "Pins media URL",
        plugins: ["Pinata Upload"],
        status: statusFor(2, active, phase),
        icon: "ipfs",
      },
    },
    {
      id: "wallet",
      type: "agent",
      position: { x: 510, y: 140 },
      data: {
        label: "Wallet Signature",
        role: "Merchant confirms",
        status: statusFor(3, active, phase),
        icon: "wallet",
      },
    },
    {
      id: "resolver",
      type: "agent",
      position: { x: 765, y: 58 },
      data: {
        label: "ENS Resolver",
        role: "Writes text records",
        plugins: ["Ethereum Sepolia"],
        status: statusFor(4, active, phase),
        icon: "key",
      },
    },
  ]
  const edges: Edge[] = [
    { id: "e1", source: "orchestration", target: "monitor", animated: true, type: "smoothstep", label: "profile update" },
    { id: "e2", source: "monitor", target: "ipfs", animated: true, type: "smoothstep", label: "media upload" },
    { id: "e3", source: "ipfs", target: "wallet", animated: true, type: "smoothstep", label: "URL ready" },
    { id: "e4", source: "wallet", target: "resolver", animated: true, type: "smoothstep", label: "setText" },
  ]
  return { nodes, edges }
}

const buildTreasuryFlow = (phase: FlowPhase) => {
  const active = phaseIndex(phase, "treasury-config-update")
  const nodes: Node<AgentNodeData>[] = [
    {
      id: "orchestration",
      type: "agent",
      position: { x: 0, y: 55 },
      data: {
        label: "Orchestration Agent",
        role: "Validates update",
        plugins: ["CounterAgent Plugin"],
        status: statusFor(0, active, phase),
        icon: "bot",
      },
    },
    {
      id: "wallet",
      type: "agent",
      position: { x: 255, y: 55 },
      data: {
        label: "Wallet Signature",
        role: "Merchant confirms",
        status: statusFor(1, active, phase),
        icon: "wallet",
      },
    },
    {
      id: "registry",
      type: "agent",
      position: { x: 510, y: 55 },
      data: {
        label: "Merchant Registry",
        role: "Stores treasury config",
        plugins: ["Base Sepolia"],
        status: statusFor(2, active, phase),
        icon: "registry",
      },
    },
    {
      id: "reporting",
      type: "agent",
      position: { x: 765, y: 55 },
      data: {
        label: "Reporting Agent",
        role: "Audit trail context",
        plugins: ["Report Plugin"],
        status: statusFor(3, active, phase),
        icon: "report",
      },
    },
  ]
  const edges: Edge[] = [
    { id: "e1", source: "orchestration", target: "wallet", animated: true, type: "smoothstep", label: "prepare" },
    { id: "e2", source: "wallet", target: "registry", animated: true, type: "smoothstep", label: "update" },
    { id: "e3", source: "registry", target: "reporting", animated: true, type: "smoothstep", label: "sync" },
  ]
  return { nodes, edges }
}

export function AgentInteractionFlow({ mode, phase, className = "" }: { mode: FlowMode; phase: FlowPhase; className?: string }) {
  const { nodes, edges } = useMemo(() => (mode === "ens-profile-update" ? buildEnsFlow(phase) : buildTreasuryFlow(phase)), [mode, phase])
  const title = mode === "ens-profile-update" ? "Agent interaction: ENS profile update" : "Agent interaction: treasury config update"
  const subtitle = mode === "ens-profile-update" ? "Shows how media, plugins, wallet signatures, and ENS records coordinate." : "Shows how the agent system prepares, signs, stores, and reports treasury config updates."

  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-background/95 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-black text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          Live agents
        </div>
      </div>
      <div className="h-[280px] bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.13),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.92))]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(148,163,184,0.25)" gap={18} />
        </ReactFlow>
      </div>
    </div>
  )
}
