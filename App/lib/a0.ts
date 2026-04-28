export const orchestratorUrl =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_A0_URL ||
  "https://orchestrator.counteragent.perkos.xyz"

export const a0Url = orchestratorUrl

export type SessionResolveRequest = {
  walletAddress: `0x${string}`
  chainId: number
}

export type SessionResolveResponse =
  | {
      ok: true
      route: "dashboard"
      registered: true
      merchant?: unknown
    }
  | {
      ok: true
      route: "onboarding"
      registered: false
      reason: string
    }

export type OnboardingRequest = {
  walletAddress: `0x${string}`
  chainId: number
  merchantName: string
  ensLabel: string
  ensName?: string
  fxThresholdBps: number
  riskTolerance: "Conservative" | "Moderate" | "Aggressive"
  preferredStablecoin: "USDC" | "EURC" | "USDT"
  telegramChat?: string
  registryTxHash?: `0x${string}`
  idempotencyKey?: string
}

export async function resolveSession(input: SessionResolveRequest) {
  const res = await fetch(`${orchestratorUrl}/session/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Orchestrator session resolve failed: ${res.status}`)
  }

  return res.json() as Promise<SessionResolveResponse>
}

export async function startOnboarding(input: OnboardingRequest) {
  const res = await fetch(`${orchestratorUrl}/onboarding/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Orchestrator onboarding failed: ${res.status}`)
  }

  return res.json()
}
