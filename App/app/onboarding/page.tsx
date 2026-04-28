"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Zap, Check, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"

const steps = ["Connect", "Configure", "Active"]
const riskLevels = ["Conservative", "Moderate", "Aggressive"] as const
const stablecoins = ["USDC", "EURC", "USDT"] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [ensName, setEnsName] = useState("")
  const [threshold, setThreshold] = useState([0.5])
  const [riskTolerance, setRiskTolerance] = useState<string>("Moderate")
  const [telegramChat, setTelegramChat] = useState("")
  const [preferredCoin, setPreferredCoin] = useState<string>("USDC")

  function handleActivate() {
    setCurrentStep(2)
    router.push("/dashboard")
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
          {/* ENS Name */}
          <Card>
            <CardContent className="px-4 py-4">
              <label className="mb-2 block text-sm font-semibold text-foreground">ENS Name</label>
              <Input
                placeholder="yourname.eth"
                value={ensName}
                onChange={(e) => setEnsName(e.target.value)}
                className="bg-secondary"
              />
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

        {/* Activate */}
        <Button
          size="lg"
          onClick={handleActivate}
          className="w-full rounded-xl bg-primary py-6 text-base font-bold text-primary-foreground shadow-lg hover:bg-primary/90 lg:mx-auto lg:max-w-md"
        >
          Activate CounterAgent &rarr;
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Stored in your ENS text records &mdash; self-custodial, no server.
        </p>
      </main>
    </div>
  )
}
