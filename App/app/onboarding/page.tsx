"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DynamicWidget } from "@dynamic-labs/sdk-react-core"
import { Zap, ArrowLeft, Loader2, Bell, Coins, FileText, Globe2, Network, ShieldCheck, TrendingUp, Pause, ArrowRightLeft, AlertTriangle, CalendarDays, Link2, CheckCircle2, Circle } from "lucide-react"
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { AgentInteractionFlow } from "@/components/agent-interaction-flow"
import { SessionHeaderActions } from "@/components/session-header-actions"
import { prepareOnboarding, startOnboarding, telegramBotStartUrl, telegramBotUsername, type OnboardingPrepareResponse } from "@/lib/a0"
import {
  activeChain,
  activeChainSwitchParams,
  merchantRegistryAddress,
  merchantRegistryConfigured,
} from "@/lib/registry"
import { dynamicConfigured } from "@/lib/dynamic-config"

const riskLevels = ["Conservative", "Moderate", "Aggressive"] as const
const stablecoins = ["USDC", "EURC", "USDT", "CUSD", "CEUR", "CELO"] as const
const ensParent = "counteragents.eth"

const onboardingSteps = [
  {
    id: "ens",
    label: "ENS",
    title: "Merchant identity",
    description: "Reserve a counteragents.eth subname that mirrors public discovery config.",
    icon: Globe2,
  },
  {
    id: "network",
    label: "Network",
    title: "Base Sepolia",
    description: "Register treasury config on the active CounterAgent merchant registry chain.",
    icon: Network,
  },
  {
    id: "token",
    label: "Token",
    title: "Stablecoin output",
    description: "Choose the preferred output asset for FX-aware settlement.",
    icon: Coins,
  },
  {
    id: "guardrails",
    label: "Guardrails",
    title: "Risk controls",
    description: "Set risk tolerance before the agent can execute conversion decisions.",
    icon: ShieldCheck,
  },
  {
    id: "fxrate",
    label: "FX Rate",
    title: "Conversion trigger",
    description: "Define the rate-improvement threshold that activates swaps.",
    icon: TrendingUp,
  },
  {
    id: "telegram",
    label: "Telegram",
    title: "Operator alerts",
    description: "Send activation, conversion, anomaly, and report events to Telegram.",
    icon: Bell,
  },
] as const

function sanitizeMerchantSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\.counteragent\.eth$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export default function OnboardingPage() {
  const router = useRouter()
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData()

  const [merchantSlug, setMerchantSlug] = useState("")
  const [threshold, setThreshold] = useState([0.5])
  const [thresholdTouched, setThresholdTouched] = useState(false)
  const [riskTolerance, setRiskTolerance] = useState<typeof riskLevels[number] | null>(null)
  const [telegramChat, setTelegramChat] = useState("")
  const [telegramReviewed, setTelegramReviewed] = useState(false)
  const [preferredCoin, setPreferredCoin] = useState<typeof stablecoins[number] | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0)
  const [selectedNetwork, setSelectedNetwork] = useState<"Base" | "Celo" | null>(null)
  const [maxPerSwap, setMaxPerSwap] = useState("500")
  const [dailyLimit, setDailyLimit] = useState("2000")
  const [maxSlippage, setMaxSlippage] = useState("0.3")
  const [confirmMode, setConfirmMode] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [debugText, setDebugText] = useState<string | null>(null)
  const [reportUri, setReportUri] = useState<string | null>(null)
  const [isActivating, setIsActivating] = useState(false)
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false)
  const [preparedRegistration, setPreparedRegistration] = useState<OnboardingPrepareResponse | null>(null)

  const connectedToTargetChain = chainId === activeChain.id
  const onboardingFlowPhase = error
    ? "error"
    : isActivating || isSigning
      ? "mining"
      : preparedRegistration
        ? "confirming"
        : statusText
          ? "preparing"
          : "idle"
  const telegramConnectUrl = telegramBotStartUrl((address ?? merchantSlug) || undefined)
  const activeStep = onboardingSteps[currentStep]
  const currentStepNumber = currentStep + 1

  const isStepReady = (stepId: typeof onboardingSteps[number]["id"]) => {
    if (stepId === "ens") return Boolean(address && merchantSlug)
    if (stepId === "network") return Boolean(selectedNetwork && connectedToTargetChain)
    if (stepId === "token") return Boolean(preferredCoin)
    if (stepId === "guardrails") return Boolean(riskTolerance)
    if (stepId === "fxrate") return thresholdTouched
    return telegramReviewed
  }

  const canGoNext = isStepReady(activeStep.id)
  const completedSteps = maxUnlockedStep

  function goToNextStep() {
    const nextStep = Math.min(onboardingSteps.length - 1, currentStep + 1)
    setMaxUnlockedStep((step) => Math.max(step, nextStep))
    setCurrentStep(nextStep)
  }


  async function handleSwitchNetwork() {
    setError(null)
    setStatusText(`Requesting wallet network switch to ${activeChain.name}…`)
    setDebugText(`wallet=${address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "n/a"} chain=${chainId} target=${activeChain.id}`)
    setIsSwitchingNetwork(true)
    try {
      await switchChainAsync(activeChainSwitchParams)
      setStatusText(`Wallet switched to ${activeChain.name}. You can activate now.`)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network switch failed"
      setError(
        `${message}. Please switch your wallet manually to ${activeChain.name} (chain ID ${activeChain.id}) and try again.`
      )
    } finally {
      setIsSwitchingNetwork(false)
    }
  }

  async function handleActivate() {
    setError(null)
    setStatusText(null)
    setDebugText(null)
    setReportUri(null)

    if (!address) {
      setError("Connect your wallet first.")
      return
    }
    if (!merchantSlug) {
      setError("Choose a merchant subname first.")
      return
    }
    if (!merchantRegistryConfigured || !merchantRegistryAddress) {
      setError("Merchant registry address is not configured.")
      return
    }

    try {
      setIsActivating(true)
      setDebugText(`wallet=${address.slice(0, 6)}…${address.slice(-4)} chain=${chainId} target=${activeChain.id}`)

      if (chainId !== activeChain.id) {
        setError(`Please switch your wallet to ${activeChain.name} before activating.`)
        return
      }

      const fxThresholdBps = Math.round(threshold[0] * 100) // 0.5% → 50 bps
      const merchantEnsName = `${merchantSlug}.${ensParent}`

      let prepared = preparedRegistration
      if (!prepared) {
        setStatusText("Orchestration Agent is preparing delegated registry authorization…")
        prepared = await prepareOnboarding({
          walletAddress: address,
          chainId: activeChain.id,
          ensName: merchantEnsName,
          fxThresholdBps,
          riskTolerance: riskTolerance ?? "Moderate",
          preferredStablecoin: preferredCoin ?? "USDC",
          telegramChat,
        })
        setPreparedRegistration(prepared)
        setDebugText(
          `prepared nonce=${prepared.message.nonce} deadline=${prepared.message.deadline} registry=${prepared.domain.verifyingContract.slice(0, 6)}…${prepared.domain.verifyingContract.slice(-4)}`
        )
        setStatusText("Authorization prepared. Click Sign registration authorization to open your wallet.")
        return
      }
      setDebugText(
        `prepared nonce=${prepared.message.nonce} deadline=${prepared.message.deadline} registry=${prepared.domain.verifyingContract.slice(0, 6)}…${prepared.domain.verifyingContract.slice(-4)}`
      )

      setStatusText("Sign the CounterAgent registration authorization…")
      const registrationSignature = await signTypedDataAsync({
        domain: prepared.domain,
        types: prepared.types,
        primaryType: prepared.primaryType,
        message: {
          ...prepared.message,
          nonce: BigInt(prepared.message.nonce),
          deadline: BigInt(prepared.message.deadline),
        },
      })
      setPreparedRegistration(null)
      setDebugText(`signature=${registrationSignature.slice(0, 10)}… len=${registrationSignature.length}`)

      setStatusText("Orchestration Agent is registering your treasury and provisioning ENS…")
      const onboarding = await startOnboarding({
        walletAddress: address,
        chainId: activeChain.id,
        merchantName: merchantSlug,
        ensLabel: merchantSlug,
        ensName: merchantEnsName,
        fxThresholdBps,
        riskTolerance: riskTolerance ?? "Moderate",
        preferredStablecoin: preferredCoin ?? "USDC",
        telegramChat,
        registrationSignature,
        registrationDeadline: prepared.message.deadline,
        idempotencyKey: `${activeChain.id}:${address.toLowerCase()}:${merchantSlug}`,
      })

      if (!onboarding.ok) {
        throw new Error(onboarding.error || "Orchestrator onboarding failed")
      }
      setDebugText(`Orchestration Agent status=${onboarding.status ?? "ok"} tx=${onboarding.registryTxHash?.slice(0, 10) ?? "n/a"}`)

      if (onboarding.report?.storageUri) {
        setReportUri(onboarding.report.storageUri)
      }

      setStatusText(
        onboarding.report?.storageUri
          ? `Treasury config active. Report stored at ${onboarding.report.storageUri}. Opening dashboard…`
          : "Treasury config active. Opening dashboard…"
      )
      router.push("/dashboard")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed"
      setError(
        message.includes("User rejected") || message.includes("rejected")
          ? "Wallet signature was rejected. Please try again and approve the CounterAgent registration authorization."
          : message.includes("chain") || message.includes("network")
          ? `Wallet network issue. Please switch to ${activeChain.name} and try again.`
          : message.includes("RPC") || message.includes("rpc")
          ? "RPC error while preparing the registration. Please retry; if it repeats, send this exact error."
          : message
      )
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between bg-header-bg px-4 py-3 text-header-foreground lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="mr-2 hidden items-center lg:flex">
            <ArrowLeft className="h-4 w-4 text-header-foreground/60 hover:text-header-foreground" />
          </Link>
          <Zap className="h-5 w-5 text-primary" fill="currentColor" />
          <span className="text-lg font-bold tracking-tight">Counter Agent</span>
        </div>
        <SessionHeaderActions />
      </header>

      {/* Guided onboarding */}
      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:gap-6 lg:p-8">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <FileText className="h-3.5 w-3.5" /> Guided onboarding
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground lg:text-4xl">Set up CounterAgent</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground lg:text-base">
              Six focused steps configure ENS identity, network, preferred token, risk guardrails, FX trigger, and Telegram alerts before the agent goes live.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Progress</p>
                <p className="text-sm font-bold text-foreground">Step {currentStepNumber} of {onboardingSteps.length}: {activeStep.title}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-primary">{completedSteps}/{onboardingSteps.length}</p>
                <p className="text-[11px] text-muted-foreground">complete</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <AgentInteractionFlow
          mode="treasury-config-update"
          phase={onboardingFlowPhase}
          heightClassName="h-[230px] sm:h-[280px] lg:h-[340px]"
        />

        <div className="rounded-3xl border border-border bg-card px-3 py-4 shadow-sm lg:px-5">
          <div className="flex items-start justify-between gap-1">
            {onboardingSteps.map((step, index) => {
              const complete = index < maxUnlockedStep
              const unlocked = index <= maxUnlockedStep
              const selected = index === currentStep
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => unlocked && setCurrentStep(index)}
                  disabled={!unlocked}
                  className="group relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center disabled:cursor-not-allowed"
                >
                  {index < onboardingSteps.length - 1 && (
                    <span className={`absolute left-[calc(50%+18px)] top-4 h-0.5 w-[calc(100%-36px)] ${complete ? "bg-primary" : "bg-border"}`} />
                  )}
                  <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all ${
                    complete
                      ? "bg-emerald-500 text-white"
                      : selected
                        ? "bg-primary text-primary-foreground shadow-[0_0_18px_rgba(236,72,153,0.35)]"
                        : "bg-secondary text-muted-foreground"
                  }`}>
                    {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className={`truncate text-[10px] font-bold ${selected ? "text-primary" : "text-muted-foreground"}`}>{step.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="border-b border-border bg-secondary/40 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Step {currentStepNumber} · {activeStep.label}</p>
                <h2 className="mt-1 text-xl font-black text-foreground">{activeStep.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{activeStep.description}</p>
              </div>

              <div className="p-5">
                {currentStep === 0 && (
                  <div className="grid gap-4">
                    {!address && (
                      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                        <p className="text-sm font-bold text-foreground">Connect your wallet</p>
                        <p className="mt-1 text-xs text-muted-foreground">Wallet connection starts here, after an explicit click.</p>
                        <div className="mt-3">
                          {dynamicConfigured ? (
                            <DynamicWidget />
                          ) : (
                            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                              Dynamic environment is not configured in this build. Rebuild with NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Merchant ENS subname</label>
                      <div className="flex overflow-hidden rounded-xl border border-input bg-secondary focus-within:ring-[3px] focus-within:ring-ring/50">
                        <Input
                          placeholder="your-store"
                          value={merchantSlug}
                          onChange={(e) => { setPreparedRegistration(null); setMerchantSlug(sanitizeMerchantSlug(e.target.value)) }}
                          className="rounded-none border-0 bg-transparent focus-visible:ring-0"
                        />
                        <span className="flex items-center border-l border-border px-3 text-sm font-medium text-muted-foreground">.{ensParent}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">ENS Monitor will provision this subname and assign it to your connected wallet.</p>
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-black text-foreground">Choose Network</h3>
                      <p className="text-sm text-muted-foreground">Your treasury will run on this chain</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {[
                          { name: "Base" as const, title: "Base", subtitle: "Ethereum L2", caption: "Low fees", tone: "border-blue-500 bg-blue-50 text-blue-700" },
                          { name: "Celo" as const, title: "Celo", subtitle: "Mobile-first", caption: "African stablecoins", tone: "border-yellow-500 bg-yellow-50 text-yellow-700" },
                        ].map((network) => {
                          const selected = selectedNetwork === network.name
                          return (
                            <button
                              key={network.name}
                              type="button"
                              onClick={() => setSelectedNetwork(network.name)}
                              className={`rounded-2xl border-2 px-3 py-4 text-center transition-all ${selected ? network.tone : "border-border bg-background hover:border-primary/40"}`}
                            >
                              <p className="text-2xl">{network.name === "Base" ? "◇" : "🌿"}</p>
                              <p className="mt-1 text-sm font-black">{network.title}</p>
                              <p className="text-xs text-muted-foreground">{network.subtitle}</p>
                              <p className="text-xs text-muted-foreground">{network.caption}</p>
                              <span className={`mt-3 inline-flex w-full justify-center rounded-full px-3 py-1.5 text-xs font-black ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                                {selected ? "Selected ✓" : "Select"}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-secondary px-4 py-4">
                      <p className="text-sm font-bold text-foreground">Active registry chain: {activeChain.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Chain ID {activeChain.id} · Merchant registry {merchantRegistryConfigured ? "configured" : "missing"}</p>
                    </div>
                    {address && !connectedToTargetChain ? (
                      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
                        <p className="text-sm font-bold text-foreground">Wrong wallet network</p>
                        <p className="mt-1 text-xs text-muted-foreground">Switch to {activeChain.name} before activating.</p>
                        <Button type="button" onClick={handleSwitchNetwork} disabled={isSwitchingNetwork} className="mt-3 w-full rounded-xl">
                          {isSwitchingNetwork ? "Requesting network switch…" : `Switch to ${activeChain.name}`}
                        </Button>
                      </div>
                    ) : (
                      <p className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">Network is ready for onboarding.</p>
                    )}
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-black text-foreground">Preferred Stablecoin</h3>
                      <p className="text-sm text-muted-foreground">
                        Choose a token available on {selectedNetwork ?? "the selected network"}. Other network tokens stay visible so you understand the expansion path.
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-foreground">Base tokens</p>
                        {selectedNetwork === "Base" ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">Enabled</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["USDC", "EURC", "USDT"] as const).map((coin) => {
                          const enabled = selectedNetwork === "Base"
                          return (
                            <button
                              key={coin}
                              type="button"
                              disabled={!enabled}
                              onClick={() => { if (!enabled) return; setPreparedRegistration(null); setPreferredCoin(coin) }}
                              className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${preferredCoin === coin ? "border-primary bg-primary/10 text-primary" : enabled ? "border-border bg-background text-foreground hover:border-primary/40" : "border-border bg-secondary text-muted-foreground"}`}
                            >
                              <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${enabled ? "bg-primary" : "bg-muted-foreground/40"}`} />{coin}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-foreground">Celo tokens</p>
                        {selectedNetwork === "Celo" ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">Enabled</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ["cUSD", "CUSD", true],
                          ["cEUR", "CEUR", true],
                          ["CELO", "CELO", true],
                          ["cKES", "CKES", false],
                          ["cGHS", "CGHS", false],
                          ["cREAL", "CREAL", false],
                          ["eXOF", "EXOF", false],
                        ] as const).map(([label, value, supported]) => {
                          const enabled = selectedNetwork === "Celo" && supported
                          return (
                            <button
                              key={label}
                              type="button"
                              disabled={!enabled}
                              onClick={() => { if (!enabled) return; setPreparedRegistration(null); setPreferredCoin(value as typeof stablecoins[number]) }}
                              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${preferredCoin === value ? "border-primary bg-primary/10 text-primary" : enabled ? "border-border bg-background text-foreground hover:border-primary/40" : "border-border bg-secondary text-muted-foreground"}`}
                            >
                              <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />{label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="grid gap-4">
                    <div>
                      <h3 className="text-lg font-black text-foreground">Set Your Guardrails</h3>
                      <p className="text-sm text-muted-foreground">The agent can never exceed these limits. Stored in your ENS profile.</p>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-border bg-background">
                      {[
                        { label: "Max per swap", help: "Single transaction cap", value: maxPerSwap, setter: setMaxPerSwap, suffix: "USDC" },
                        { label: "Daily limit", help: "Total across all swaps / 24h", value: dailyLimit, setter: setDailyLimit, suffix: "USDC" },
                        { label: "Max slippage", help: "Reject swap if exceeded", value: maxSlippage, setter: setMaxSlippage, suffix: "%" },
                      ].map((field, index) => (
                        <div key={field.label} className={`grid grid-cols-[1fr_150px] items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}>
                          <div>
                            <p className="text-sm font-black text-foreground">{field.label}</p>
                            <p className="text-xs leading-tight text-muted-foreground">{field.help}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input value={field.value} onChange={(e) => field.setter(e.target.value)} className="h-9 rounded-xl bg-secondary text-right font-black" />
                            <span className="w-10 text-xs font-bold text-muted-foreground">{field.suffix}</span>
                          </div>
                        </div>
                      ))}
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-foreground">Confirm mode</p>
                          <p className="text-xs leading-tight text-muted-foreground">Require Telegram YES before swap</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmMode((value) => !value)}
                          className={`flex h-8 w-14 items-center rounded-full px-1 transition-colors ${confirmMode ? "bg-primary" : "bg-secondary"}`}
                        >
                          <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${confirmMode ? "translate-x-6" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                      <p className="text-sm font-black text-primary">Strict mode is ON</p>
                      <p className="mt-2 text-xs leading-relaxed text-foreground">No swap will execute without your configured ENS policy and operator confirmation rules.</p>
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-sm font-black text-foreground">CounterAgent can never:</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <li>✕ Send funds to external wallets</li>
                        <li>✕ Exceed your spending cap</li>
                        <li>✕ Act without your ENS config</li>
                      </ul>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div>
                    <label className="mb-3 block text-sm font-semibold text-foreground">FX conversion threshold</label>
                    <Slider
                      value={threshold}
                      onValueChange={(value) => { setPreparedRegistration(null); setThresholdTouched(true); setThreshold(value) }}
                      max={2}
                      min={0}
                      step={0.1}
                      className="mb-3"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span className="rounded-full bg-primary/10 px-3 py-1 font-bold text-primary">{threshold[0].toFixed(1)}% trigger</span>
                      <span>2%</span>
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="grid gap-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="block text-sm font-semibold text-foreground">Telegram Chat ID</label>
                        <a href={telegramConnectUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary underline-offset-4 hover:underline">
                          Connect @{telegramBotUsername.replace(/^@/, "")}
                        </a>
                      </div>
                      <Input
                        placeholder="numeric chat_id after /start"
                        value={telegramChat}
                        onChange={(e) => { setPreparedRegistration(null); setTelegramReviewed(true); setTelegramChat(e.target.value) }}
                        className="bg-secondary"
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Open the bot link, press /start, then store the numeric chat_id for A4 report alerts.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={telegramReviewed && !telegramChat ? "default" : "outline"} onClick={() => { setPreparedRegistration(null); setTelegramReviewed(true); setTelegramChat("") }} className="rounded-xl">
                        Review and skip
                      </Button>
                      <Button type="button" variant={telegramReviewed && telegramChat ? "default" : "outline"} onClick={() => setTelegramReviewed(true)} disabled={!telegramChat} className="rounded-xl">
                        Use Telegram alerts
                      </Button>
                    </div>

                    <div className="grid gap-2">
                      {[
                        { agent: "A2", title: "Decision alerts", description: "Convert/Hold decisions and confidence", icon: Pause, tone: "bg-warning/10 text-warning-foreground" },
                        { agent: "A3", title: "Execution alerts", description: "Quotes, swaps, and skipped executions", icon: ArrowRightLeft, tone: "bg-success/10 text-success" },
                        { agent: "A4", title: "Report alerts", description: "Audit report pointers and review events", icon: FileText, tone: "bg-primary/10 text-primary" },
                        { agent: "!", title: "Anomaly alerts", description: "Critical events only", icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
                        { agent: "W", title: "Weekly summary", description: "Every Monday 9am", icon: CalendarDays, tone: "bg-primary/10 text-primary" },
                      ].map((alert) => (
                        <div key={alert.agent} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${alert.tone}`}>
                            <alert.icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${alert.tone}`}>{alert.agent}</span>
                              <p className="truncate text-xs font-bold text-foreground">{alert.title}</p>
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">{alert.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardContent className="px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current onboarding variables</p>
              <h2 className="mt-1 text-lg font-black text-foreground">Review before activation</h2>
              <div className="mt-4 grid gap-2">
                {[
                  ["ENS", merchantSlug ? `${merchantSlug}.${ensParent}` : `pending.${ensParent}`],
                  ["Network", selectedNetwork ? `${selectedNetwork} · ${activeChain.name}` : "choose network"],
                  ["Token", preferredCoin ?? "choose token"],
                  ["Guardrails", riskTolerance ? `${riskTolerance} · ${maxPerSwap} max` : "review limits"],
                  ["FX Rate", thresholdTouched ? `${threshold[0].toFixed(1)}% trigger` : "review trigger"],
                  ["Telegram", telegramReviewed ? (telegramChat || "skipped") : "review alerts"],
                  ["Integrations", "Uniswap · ENS · Gensyn"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2">
                    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                    <span className="truncate text-right font-mono text-xs font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {statusText && <p className="rounded-lg bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">{statusText}</p>}
        {reportUri && <p className="rounded-lg bg-success/10 px-4 py-2 text-center text-xs font-medium text-success">Reporting Agent pointer: {reportUri}</p>}
        {error && <p className="rounded-lg bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">{error}</p>}
        {debugText && <p className="rounded-lg bg-secondary px-4 py-2 text-center font-mono text-[11px] text-muted-foreground">Debug: {debugText}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" disabled={currentStep === 0} onClick={() => setCurrentStep((step) => Math.max(0, step - 1))} className="rounded-xl">
            Back
          </Button>
          {currentStep < onboardingSteps.length - 1 ? (
            <Button type="button" disabled={!canGoNext} onClick={goToNextStep} className="rounded-xl">
              Continue to {onboardingSteps[currentStep + 1].label}
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleActivate}
              disabled={isActivating || isSigning || !address || !merchantSlug || !connectedToTargetChain || maxUnlockedStep < onboardingSteps.length - 1 || !telegramReviewed}
              className="rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-60"
            >
              {isActivating || isSigning ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Activating treasury…</span>
              ) : !address ? (
                "Connect wallet to activate"
              ) : !merchantSlug ? (
                "Choose your merchant subname"
              ) : !connectedToTargetChain ? (
                `Switch to ${activeChain.name} first`
              ) : preparedRegistration ? (
                "Sign registration authorization"
              ) : (
                <>Activate {merchantSlug}.{ensParent} &rarr;</>
              )}
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">Execution settings are stored in the active network registry. ENS records mirror public agent-discovery config.</p>
      </main>
    </div>
  )
}
