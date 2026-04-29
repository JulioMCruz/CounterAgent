export const orchestratorUrl =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_A0_URL ||
  "http://localhost:8787"

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
  registrationSignature?: `0x${string}`
  registrationDeadline?: number
  idempotencyKey?: string
}

export type ReportPointer = {
  ok?: boolean
  reportId?: string
  backend?: string
  contentHash?: string
  storageUri?: string
  rootHash?: string
  transactionHash?: string
}

export type OnboardingResponse = {
  ok: boolean
  onboardingId?: string
  status?: string
  next?: string
  registryTxHash?: `0x${string}`
  ens?: unknown
  report?: ReportPointer | null
  reportWarning?: string
  error?: string
}

export type WorkflowEvaluateRequest = {
  workflowId?: string
  merchantEns?: string
  walletAddress: `0x${string}`
  chainId?: number
  fromToken: "USDC" | "EURC" | "USDT"
  toToken?: "USDC" | "EURC" | "USDT"
  amount: string
  fxThresholdBps?: number
  riskTolerance?: "conservative" | "moderate" | "aggressive" | "Conservative" | "Moderate" | "Aggressive"
  slippageBps?: number
  baselineRate?: number
  dryRunRate?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export type WorkflowEvaluateResponse = {
  ok: boolean
  workflowId?: string
  status?: string
  quote?: {
    ok?: boolean
    quote?: {
      provider?: string
      rate?: number
      baselineRate?: number
      feeBps?: number
      priceImpactBps?: number
      quoteId?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  decision?: {
    ok?: boolean
    decision?: {
      action?: "HOLD" | "CONVERT"
      confidence?: number
      reason?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  execution?: {
    ok?: boolean
    status?: string
    transactionHash?: string | null
    [key: string]: unknown
  }
  report?: ReportPointer | null
  reportWarning?: string
  error?: string
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

  return res.json() as Promise<OnboardingResponse>
}

export async function evaluateWorkflow(input: WorkflowEvaluateRequest) {
  const res = await fetch(`${orchestratorUrl}/workflow/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Orchestrator workflow failed: ${res.status}`)
  }

  return res.json() as Promise<WorkflowEvaluateResponse>
}
