"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Zap, Check, ArrowLeft, Loader2 } from "lucide-react"
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { SessionHeaderActions } from "@/components/session-header-actions"
import { prepareOnboarding, startOnboarding, type OnboardingPrepareResponse } from "@/lib/a0"
import {
  activeChain,
  activeChainSwitchParams,
  merchantRegistryAddress,
  merchantRegistryConfigured,
} from "@/lib/registry"

const steps = ["Connect", "Configure", "Active"]
const riskLevels = ["Conservative", "Moderate", "Aggressive"] as const
const stablecoins = ["USDC", "EURC", "USDT"] as const
const ensParent = "counteragent.eth"

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

  const [currentStep, setCurrentStep] = useState(1)
  const [merchantSlug, setMerchantSlug] = useState("")
  const [threshold, setThreshold] = useState([0.5])
  const [riskTolerance, setRiskTolerance] = useState<typeof riskLevels[number]>("Moderate")
  const [telegramChat, setTelegramChat] = useState("")
  const [preferredCoin, setPreferredCoin] = useState<typeof stablecoins[number]>("USDC")
  const [error, setError] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [debugText, setDebugText] = useState<string | null>(null)
  const [reportUri, setReportUri] = useState<string | null>(null)
  const [isActivating, setIsActivating] = useState(false)
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false)
  const [preparedRegistration, setPreparedRegistration] = useState<OnboardingPrepareResponse | null>(null)

  const connectedToTargetChain = chainId === activeChain.id

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
          riskTolerance,
          preferredStablecoin: preferredCoin,
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
        riskTolerance,
        preferredStablecoin: preferredCoin,
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

      setCurrentStep(2)
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

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 border-b border-border bg-card px-4 py-3">
        {steps.map((step, i) => {
          const isCompleted = i < currentStep
          const isCurrent = i === currentStep
          return (
            <button
              key={step}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                isCurrent
                  ? "bg-header-bg text-header-foreground"
                  : isCompleted
                  ? "bg-success/10 text-success"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {isCompleted && <Check className="h-3 w-3" />}
              {step}
            </button>
          )
        })}
      </div>

      {/* Form - centered on desktop */}
      <main className="mx-auto flex max-w-2xl flex-col gap-5 p-5 lg:p-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground lg:text-3xl">Set Up Your Treasury</h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">Configure once via ENS. No database. No app login.</p>
        </div>

        {/* Desktop: two-column form layout */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-6">
          {/* Merchant ENS Subname */}
          <Card>
            <CardContent className="px-4 py-4">
              <label className="mb-2 block text-sm font-semibold text-foreground">Merchant ENS Subname</label>
              <div className="flex overflow-hidden rounded-md border border-input bg-secondary focus-within:ring-[3px] focus-within:ring-ring/50">
                <Input
                  placeholder="your-store"
                  value={merchantSlug}
                  onChange={(e) => { setPreparedRegistration(null); setMerchantSlug(sanitizeMerchantSlug(e.target.value)) }}
                  className="rounded-none border-0 bg-transparent focus-visible:ring-0"
                />
                <span className="flex items-center border-l border-border px-3 text-sm font-medium text-muted-foreground">
                  .{ensParent}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ENS Monitor Agent will provision this subname and assign it to your connected wallet.
              </p>
            </CardContent>
          </Card>

          {/* FX Threshold */}
          <Card>
            <CardContent className="px-4 py-4">
              <label className="mb-3 block text-sm font-semibold text-foreground">FX Conversion Threshold</label>
              <Slider
                value={threshold}
                onValueChange={(value) => { setPreparedRegistration(null); setThreshold(value) }}
                max={2}
                min={0}
                step={0.1}
                className="mb-2"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span className="font-bold text-foreground">{threshold[0].toFixed(1)}%</span>
                <span>2%</span>
              </div>
            </CardContent>
          </Card>

          {/* Risk Tolerance */}
          <Card>
            <CardContent className="flex h-full flex-col justify-center px-4 py-4">
              <label className="mb-3 block text-sm font-semibold text-foreground">Risk Tolerance</label>
              <div className="grid grid-cols-3 gap-2">
                {riskLevels.map((level) => (
                  <button
                    key={level}
                    onClick={() => { setPreparedRegistration(null); setRiskTolerance(level) }}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                      riskTolerance === level
                        ? "bg-header-bg text-header-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Telegram */}
          <Card>
            <CardContent className="px-4 py-4">
              <label className="mb-2 block text-sm font-semibold text-foreground">Telegram Chat ID</label>
              <Input
                placeholder="@yourchat or chat ID"
                value={telegramChat}
                onChange={(e) => { setPreparedRegistration(null); setTelegramChat(e.target.value) }}
                className="bg-secondary"
              />
            </CardContent>
          </Card>
        </div>

        {/* Preferred Stablecoin - full width */}
        <Card>
          <CardContent className="px-4 py-4">
            <label className="mb-3 block text-sm font-semibold text-foreground">Preferred Stablecoin Output</label>
            <div className="flex gap-2">
              {stablecoins.map((coin) => (
                <button
                  key={coin}
                  onClick={() => { setPreparedRegistration(null); setPreferredCoin(coin) }}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                    preferredCoin === coin
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {coin}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {statusText && (
          <p className="rounded-lg bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">{statusText}</p>
        )}

        {reportUri && (
          <p className="rounded-lg bg-success/10 px-4 py-2 text-center text-xs font-medium text-success">
            Reporting Agent pointer: {reportUri}
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">{error}</p>
        )}

        {address && !connectedToTargetChain && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 px-4 py-4 text-center">
              <div>
                <p className="text-sm font-bold text-foreground">Wrong wallet network</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  CounterAgent onboarding runs on {activeChain.name} (chain ID {activeChain.id}). Switch networks before activating.
                </p>
              </div>
              <Button type="button" onClick={handleSwitchNetwork} disabled={isSwitchingNetwork} className="w-full rounded-xl">
                {isSwitchingNetwork ? "Requesting network switch…" : `Switch to ${activeChain.name}`}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                If your wallet does not open a popup, switch manually in the wallet network selector and return here.
              </p>
            </CardContent>
          </Card>
        )}

        {debugText && (
          <p className="rounded-lg bg-secondary px-4 py-2 text-center font-mono text-[11px] text-muted-foreground">
            Debug: {debugText}
          </p>
        )}

        {/* Activate */}
        <Button
          size="lg"
          onClick={handleActivate}
          disabled={isActivating || isSigning || !address || !merchantSlug || !connectedToTargetChain}
          className="w-full rounded-xl bg-primary py-6 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-60 lg:mx-auto lg:max-w-md"
        >
          {isActivating || isSigning ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Activating treasury…
            </span>
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

        <p className="text-center text-xs text-muted-foreground">
          Execution settings are stored in the Base Sepolia registry. ENS records mirror public agent-discovery config.
        </p>
      </main>
    </div>
  )
}
