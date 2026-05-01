export const orchestratorUrl = "/api/a0"

export const a0Url = orchestratorUrl

export type SessionResolveRequest = {
  walletAddress: `0x${string}`
  chainId: number
}

export type ResolvedMerchantConfig = {
  walletAddress: `0x${string}`
  ensName?: string | null
  merchantEns?: string | null
  ens?: {
    name?: string
    node?: `0x${string}`
    owner?: `0x${string}`
    resolver?: `0x${string}`
    address?: `0x${string}`
    records?: Record<string, string>
  } | null
  fxThresholdBps?: number | string
  risk?: number | string
  preferredStablecoin?: `0x${string}` | string
  telegramChatId?: `0x${string}` | string
  telegramChat?: string | null
  active?: boolean
}

export type SessionResolveResponse =
  | {
      ok: true
      route: "dashboard"
      registered: true
      merchant?: ResolvedMerchantConfig
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

export type OnboardingPrepareRequest = {
  walletAddress: `0x${string}`
  chainId: number
  ensName?: string
  fxThresholdBps: number
  riskTolerance: "Conservative" | "Moderate" | "Aggressive"
  preferredStablecoin: "USDC" | "EURC" | "USDT"
  telegramChat?: string
}

export type OnboardingPrepareResponse = {
  ok: true
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  types: {
    Register: readonly { name: string; type: string }[]
  }
  primaryType: "Register"
  message: {
    merchant: `0x${string}`
    fxThresholdBps: number
    risk: number
    preferredStablecoin: `0x${string}`
    telegramChatId: `0x${string}`
    nonce: string
    deadline: number
  }
}

export type EnsProfileRecordsRequest = {
  merchantImage?: string
  header?: string
  website?: string
  description?: string
  socials?: {
    twitter?: string
    github?: string
    discord?: string
    telegram?: string
    linkedin?: string
    instagram?: string
  }
  subnames?: string[]
}

export type EnsProfileRecordsResponse = {
  ok: true
  records: Record<string, string>
  note?: string
  preparedBy?: string
}

export type EnsProfileImageUploadResponse = {
  ok: true
  kind: "avatar" | "header"
  cid: string
  ipfsUri: string
  url: string
  mimeType: string
  size: number
  preparedBy?: string
  proxiedBy?: string
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

export type BaseStablecoin = "USDC" | "EURC" | "USDT"
export type CeloStablecoin = "cUSD" | "cEUR" | "cREAL" | "cKES" | "cCOP" | "cGHS"
export type SupportedStablecoin = BaseStablecoin | CeloStablecoin

export type VaultPlanRequest = {
  walletAddress: `0x${string}`
  chainId?: number
  preferredStablecoin?: SupportedStablecoin
  mode?: "conservative" | "moderate" | "active"
  authorizedAgent?: `0x${string}`
  targetAllowlist?: `0x${string}`[]
}

export type VaultPlanResponse = {
  ok: true
  status: "draft"
  custodyModel: "merchant-owned-non-custodial"
  chainId: number
  vault: {
    deployedAddressRequired: boolean
    owner: `0x${string}`
    authorizedAgent: `0x${string}` | null
    tokenAllowlist: { symbol: SupportedStablecoin; address: `0x${string}` }[]
    targetAllowlist: `0x${string}`[]
    preferredStablecoin: { symbol: SupportedStablecoin; address: `0x${string}` }
    policy: {
      mode: "conservative" | "moderate" | "active"
      maxTradeAmount: string
      dailyLimit: string
      maxSlippageBps: number
      expiresAt: number
      active: boolean
    }
  }
  intent: {
    domain: Record<string, unknown>
    types: Record<string, { name: string; type: string }[]>
    primaryType: "VaultPolicy"
    message: Record<string, unknown>
  }
  notes: string[]
}

export type DashboardMonitorEvent = {
  agent: "A1"
  type: "ens-config" | "merchant-lookup" | "wallet-watch" | "threshold-signal" | "provision"
  merchant: string
  ensName?: string
  status: "loaded" | "not-found" | "watching" | "signal" | "provisioned" | "error"
  fxThresholdBps?: string
  riskTolerance?: string
  preferredStablecoin?: string
  summary: string
  timestamp: string
}

export type DashboardDecision = {
  agent: "A2"
  workflowId?: string
  merchant: string
  action: "HOLD" | "CONVERT"
  confidence: number
  spreadBps?: number
  netScoreBps?: number
  thresholdBps?: number
  fromToken?: string
  toToken?: string
  amount?: string
  reason?: string
  timestamp: string
}

export type DashboardExecution = {
  agent: "A3"
  type: "quote" | "execution"
  workflowId?: string
  merchant: string
  fromToken?: string
  toToken?: string
  amount?: string
  rate?: number
  status: string
  quoteId?: string
  txHash?: string | null
  estimatedAmountOut?: string
  timestamp: string
}

export type DashboardReport = {
  agent: "A4"
  reportId: string
  merchant: string
  merchantEns?: string
  decision: string
  summary: string
  storageUri?: string
  contentHash?: string
  txHash?: string
  savingsEstimateUsd?: string
  timestamp: string
}

export type DashboardState = {
  ok: true
  merchant: string
  monitor: DashboardMonitorEvent[]
  decisions: DashboardDecision[]
  executions: DashboardExecution[]
  reports: DashboardReport[]
  kpis: {
    totalSavedUsd: string
    swapsExecuted: number
    volumeUsd: string
  }
  unavailable?: string[]
}

const stablecoinSymbolsByAddress: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": "EURC",
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": "USDC",
  "0x808456652fdb597867f38412077a9182bf77359f": "EURC",
}

export function shortenAddress(value?: string | null) {
  if (!value) return "Not connected"
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function formatBpsAsPercent(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return "Not available"
  const bps = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(bps)) return "Not available"
  return `${(bps / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: bps % 100 === 0 ? 0 : 2,
  })}% minimum spread`
}

export function riskToleranceFromRegistryRisk(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return "Not available"
  const risk = typeof value === "number" ? value : Number(value)
  if (risk === 0) return "Conservative"
  if (risk === 1) return "Moderate"
  if (risk === 2) return "Aggressive"
  return `Registry risk ${value}`
}

export function stablecoinSymbolFromAddress(value?: string | null) {
  if (!value) return "Not available"
  const normalized = value.toLowerCase()
  if (normalized === "usdc" || normalized === "eurc" || normalized === "usdt") return normalized.toUpperCase()
  return stablecoinSymbolsByAddress[normalized] ?? shortenAddress(value)
}

export function ensNameFromMerchant(merchant?: ResolvedMerchantConfig) {
  return merchant?.ensName || merchant?.merchantEns || "Not available"
}

export function telegramDisplayFromMerchant(merchant?: ResolvedMerchantConfig) {
  const value = merchant?.telegramChat || merchant?.telegramChatId
  if (!value) return "Not available"
  if (value.startsWith("@")) return value
  if (/^-?\d+$/.test(value)) return value
  return `Hash ${shortenAddress(value)}`
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

export async function prepareOnboarding(input: OnboardingPrepareRequest) {
  const res = await fetch(`${orchestratorUrl}/onboarding/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Orchestrator onboarding prepare failed: ${res.status}`)
  }

  return res.json() as Promise<OnboardingPrepareResponse>
}

export async function prepareEnsProfileRecords(input: EnsProfileRecordsRequest) {
  const res = await fetch(`${orchestratorUrl}/ens/profile/records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`ENS plugin profile record preparation failed: ${res.status}`)
  }

  return res.json() as Promise<EnsProfileRecordsResponse>
}

export async function uploadEnsProfileImage(input: { file: File; kind: "avatar" | "header" }) {
  const form = new FormData()
  form.append("file", input.file)
  form.append("kind", input.kind)

  const res = await fetch(`${orchestratorUrl}/ens/profile/upload`, {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    const error = typeof payload.error === "string" ? payload.error : `ENS image upload failed: ${res.status}`
    throw new Error(error)
  }

  return res.json() as Promise<EnsProfileImageUploadResponse>
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

export async function prepareVaultPlan(input: VaultPlanRequest) {
  const res = await fetch(`${orchestratorUrl}/vault/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw new Error(`Orchestrator vault plan failed: ${res.status}`)
  }

  return res.json() as Promise<VaultPlanResponse>
}

export async function fetchDashboardState(walletAddress: `0x${string}`) {
  const params = new URLSearchParams({ merchant: walletAddress })
  const res = await fetch(`${orchestratorUrl}/dashboard/state?${params.toString()}`)
  const contentType = res.headers.get("content-type") || ""
  const text = await res.text()

  if (!res.ok || !contentType.includes("application/json")) {
    return {
      ok: true,
      merchant: walletAddress,
      monitor: [],
      decisions: [],
      executions: [],
      reports: [],
      kpis: { totalSavedUsd: "0.00", swapsExecuted: 0, volumeUsd: "0.00" },
      unavailable: ["A0-dashboard-state"],
    } satisfies DashboardState
  }

  return JSON.parse(text) as DashboardState
}
