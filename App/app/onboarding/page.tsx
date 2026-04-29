"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Zap, Check, ArrowLeft, Loader2 } from "lucide-react"
import { keccak256, toBytes } from "viem"
import { useAccount, useWriteContract } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { SessionHeaderActions } from "@/components/session-header-actions"
import { startOnboarding } from "@/lib/a0"
import { merchantRegistryAbi } from "@/lib/merchant-registry-abi"
import {
  activeChain,
  merchantRegistryAddress,
  merchantRegistryConfigured,
  RiskTolerance,
  stablecoinAddresses,
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
  const { writeContractAsync, isPending } = useWriteContract()

  const [currentStep, setCurrentStep] = useState(1)
  const [merchantSlug, setMerchantSlug] = useState("")
  const [threshold, setThreshold] = useState([0.5])
  const [riskTolerance, setRiskTolerance] = useState<typeof riskLevels[number]>("Moderate")
  const [telegramChat, setTelegramChat] = useState("")
  const [preferredCoin, setPreferredCoin] = useState<typeof stablecoins[number]>("USDC")
  const [error, setError] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [reportUri, setReportUri] = useState<string | null>(null)

  async function handleActivate() {
    setError(null)
    setStatusText(null)
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
      const fxThresholdBps = Math.round(threshold[0] * 100) // 0.5% → 50 bps
      const riskValue = RiskTolerance[riskTolerance]
      const stablecoin = stablecoinAddresses[preferredCoin]
      const merchantEnsName = `${merchantSlug}.${ensParent}`
      const chatBytes32 = keccak256(toBytes(telegramChat || merchantEnsName || address))

      setStatusText("Registering treasury config on Base Sepolia…")
      const registryTxHash = await writeContractAsync({
        address: merchantRegistryAddress,
        abi: merchantRegistryAbi,
        functionName: "register",
        args: [fxThresholdBps, riskValue, stablecoin, chatBytes32],
      })

      setStatusText("Provisioning ENS records through the Orchestrator…")
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
        registryTxHash,
        idempotencyKey: `${activeChain.id}:${address.toLowerCase()}:${merchantSlug}`,
      })

      if (!onboarding.ok) {
        throw new Error(onboarding.error || "Orchestrator onboarding failed")
      }

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
      setError(message)
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
                  onChange={(e) => setMerchantSlug(sanitizeMerchantSlug(e.target.value))}
                  className="rounded-none border-0 bg-transparent focus-visible:ring-0"
                />
                <span className="flex items-center border-l border-border px-3 text-sm font-medium text-muted-foreground">
                  .{ensParent}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A1 ENS/Monitor will provision this subname and assign it to your connected wallet.
              </p>
            </CardContent>
          </Card>

          {/* FX Threshold */}
          <Card>
            <CardContent className="px-4 py-4">
              <label className="mb-3 block text-sm font-semibold text-foreground">FX Conversion Threshold</label>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
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
                    onClick={() => setRiskTolerance(level)}
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
                onChange={(e) => setTelegramChat(e.target.value)}
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
                  onClick={() => setPreferredCoin(coin)}
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
            A4 report pointer: {reportUri}
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">{error}</p>
        )}

        {/* Activate */}
        <Button
          size="lg"
          onClick={handleActivate}
          disabled={isPending || !address || !merchantSlug}
          className="w-full rounded-xl bg-primary py-6 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-60 lg:mx-auto lg:max-w-md"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Activating treasury…
            </span>
          ) : !address ? (
            "Connect wallet to activate"
          ) : !merchantSlug ? (
            "Choose your merchant subname"
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
