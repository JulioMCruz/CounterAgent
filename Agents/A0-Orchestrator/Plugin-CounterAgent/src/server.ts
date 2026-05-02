import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, celo, celoSepolia } from 'viem/chains';
import { z } from 'zod';
import { AxlClient, type AxlMode, type AxlSendResult } from './axl-client.js';

const merchantRegistryAbi = [
  {
    type: 'function',
    name: 'registerFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'merchant', type: 'address' },
      { name: 'fxThresholdBps', type: 'uint16' },
      { name: 'risk', type: 'uint8' },
      { name: 'preferredStablecoin', type: 'address' },
      { name: 'telegramChatId', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'isActive',
    stateMutability: 'view',
    inputs: [{ name: 'merchant', type: 'address' }],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'configOf',
    stateMutability: 'view',
    inputs: [{ name: 'merchant', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'fxThresholdBps', type: 'uint16' },
          { name: 'risk', type: 'uint8' },
          { name: 'preferredStablecoin', type: 'address' },
          { name: 'telegramChatId', type: 'bytes32' },
          { name: 'active', type: 'bool' }
        ]
      }
    ]
  }
] as const;

const sessionResolveSchema = z.object({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive()
});

const ensLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const onboardingRequestSchema = z.object({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive(),
  merchantName: z.string().min(1).max(120),
  ensName: z.string().min(1).max(255).optional(),
  ensLabel: z.string().min(1).max(63).regex(ensLabelPattern).optional(),
  fxThresholdBps: z.number().int().min(0).max(10_000).optional(),
  riskTolerance: z.string().min(1).max(40).optional(),
  preferredStablecoin: z.string().min(1).max(40).optional(),
  telegramChat: z.string().max(120).optional(),
  registryTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  registrationSignature: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
  registrationDeadline: z.number().int().positive().optional(),
  callbackUrl: z.string().url().optional(),
  idempotencyKey: z.string().min(8).max(120).optional()
});

const onboardingPrepareSchema = z.object({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive(),
  ensName: z.string().min(1).max(255).optional(),
  fxThresholdBps: z.number().int().min(1).max(10_000),
  riskTolerance: z.string().min(1).max(40),
  preferredStablecoin: z.string().min(1).max(40),
  telegramChat: z.string().max(120).optional()
});

const baseStablecoinSchema = z.enum(['USDC', 'EURC', 'USDT', 'CUSD', 'CEUR', 'CELO', 'cUSD', 'cEUR']);
const celoStablecoinSchema = z.enum(['cUSD', 'cEUR', 'cREAL', 'cKES', 'cCOP', 'cGHS']);
const stablecoinSchema = z.union([baseStablecoinSchema, celoStablecoinSchema]);
const tokenSchema = baseStablecoinSchema;

const vaultPlanSchema = z.object({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive().optional(),
  preferredStablecoin: stablecoinSchema.optional(),
  mode: z.enum(['conservative', 'moderate', 'active']).default('moderate'),
  authorizedAgent: z.string().refine(isAddress, 'Invalid agent address').optional(),
  targetAllowlist: z.array(z.string().refine(isAddress, 'Invalid target address')).max(5).optional()
});

const ensProfileRecordSchema = z.object({
  merchantImage: z.string().url().max(500).optional().or(z.literal('')),
  header: z.string().url().max(500).optional().or(z.literal('')),
  website: z.string().url().max(500).optional().or(z.literal('')),
  description: z.string().max(500).optional().default(''),
  socials: z
    .object({
      twitter: z.string().max(120).optional().default(''),
      github: z.string().max(120).optional().default(''),
      discord: z.string().max(120).optional().default(''),
      telegram: z.string().max(120).optional().default(''),
      linkedin: z.string().max(200).optional().default(''),
      instagram: z.string().max(120).optional().default('')
    })
    .optional()
    .default({}),
  subnames: z.array(z.string().min(1).max(255)).max(25).optional().default([])
});

const riskSchema = z.enum(['conservative', 'moderate', 'aggressive']).or(
  z.enum(['Conservative', 'Moderate', 'Aggressive']).transform((value) => value.toLowerCase() as 'conservative' | 'moderate' | 'aggressive')
);
const workflowSchema = z.object({
  workflowId: z.string().min(1).max(120).optional(),
  merchantEns: z.string().min(1).max(255).optional(),
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive().optional(),
  fromToken: tokenSchema,
  toToken: tokenSchema.default('USDC'),
  amount: z.string().min(1).max(80),
  fxThresholdBps: z.number().int().min(0).max(10_000).default(50),
  riskTolerance: riskSchema.default('moderate'),
  slippageBps: z.number().int().min(1).max(1_000).default(50),
  baselineRate: z.number().positive().optional(),
  dryRunRate: z.number().positive().optional(),
  idempotencyKey: z.string().min(8).max(160).optional(),
  metadata: z.record(z.unknown()).optional()
});

const port = Number(process.env.PORT ?? 8787);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const merchantRegistryAddress = process.env.MERCHANT_REGISTRY_ADDRESS as Address | undefined;
const registryRelayerPrivateKey = process.env.REGISTRY_RELAYER_PRIVATE_KEY as Hex | undefined;
const baseRpcUrl = process.env.BASE_RPC_URL || 'https://sepolia.base.org';
const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const defaultChainId = Number(process.env.DEFAULT_CHAIN_ID ?? 84532);
const monitorAgentUrl = process.env.MONITOR_AGENT_URL;
const reportingAgentUrl = process.env.REPORTING_AGENT_URL;
const decisionAgentUrl = process.env.DECISION_AGENT_URL;
const executionAgentUrl = process.env.EXECUTION_AGENT_URL;
const executionAgentAddress = process.env.EXECUTION_AGENT_ADDRESS as Address | undefined;
const axlMessagingUrl = process.env.GENSYN_AXL_MESSAGING_URL;
const axlClient = new AxlClient({
  mode: process.env.GENSYN_AXL_MODE,
  nodeUrl: process.env.GENSYN_AXL_NODE_URL,
  peers: {
    A1: process.env.GENSYN_AXL_PEER_A1,
    A2: process.env.GENSYN_AXL_PEER_A2,
    A3: process.env.GENSYN_AXL_PEER_A3,
    A4: process.env.GENSYN_AXL_PEER_A4
  }
});
const axlMonitorService = process.env.GENSYN_AXL_SERVICE_A1 ?? 'counteragent-monitor';
const axlDecisionService = process.env.GENSYN_AXL_SERVICE_A2 ?? 'counteragent-decision';
const axlExecutionService = process.env.GENSYN_AXL_SERVICE_A3 ?? 'counteragent-execution';
const axlReportingService = process.env.GENSYN_AXL_SERVICE_A4 ?? 'counteragent-reporting';
const axlFallbackToHttp = process.env.GENSYN_AXL_FALLBACK_HTTP !== 'false';
const ensParentName = process.env.ENS_PARENT_NAME ?? 'counteragents.eth';

const stablecoinAddressesByChain: Record<number, Record<string, Address>> = {
  [base.id]: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    EURC: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
  },
  [baseSepolia.id]: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    EURC: '0x808456652fdb597867f38412077A9182bf77359F',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
  },
  [celo.id]: {
    CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438',
    USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    USDT: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
    CUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    CEUR: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73',
    cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    cEUR: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73',
    cREAL: '0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787',
    cKES: '0x456a3D042C0DbD3db53D5489e98dFb038553B0d0',
    cCOP: '0x8A567e2aE79CA692Bd748aB832081C45de4041eA',
    cGHS: '0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313'
  },
  [celoSepolia.id]: {
    USDC: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
    USDT: '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
    CUSD: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b',
    CEUR: '0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a',
    cUSD: '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b',
    cEUR: '0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a',
    cREAL: '0x2294298942fdc79417DE9E0D740A4957E0e7783a',
    cKES: '0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF',
    cCOP: '0x5F8d55c3627d2dc0a2B4afa798f877242F382F67',
    cGHS: '0x5e94B8C872bD47BC4255E60ECBF44D5E66e7401C'
  }
};

const stablecoinAddresses = stablecoinAddressesByChain[base.id];

function defaultStablecoinForChain(chainId: number) {
  return chainId === celo.id || chainId === celoSepolia.id ? 'CUSD' : 'USDC';
}

function stablecoinsForChain(chainId: number) {
  return stablecoinAddressesByChain[chainId] ?? stablecoinAddressesByChain[base.id];
}

function stablecoinAddressFor(chainId: number, symbol: string) {
  return stablecoinsForChain(chainId)[symbol];
}

const vaultModePolicies = {
  conservative: { maxTradeAmount: '250000000', dailyLimit: '1000000000', maxSlippageBps: 25 },
  moderate: { maxTradeAmount: '1000000000', dailyLimit: '5000000000', maxSlippageBps: 50 },
  active: { maxTradeAmount: '2500000000', dailyLimit: '10000000000', maxSlippageBps: 75 }
} as const;

const riskValueFor = (risk?: string) => {
  const normalized = (risk ?? 'moderate').toLowerCase();
  if (normalized === 'conservative') return 0;
  if (normalized === 'aggressive') return 2;
  return 1;
};

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: Number(process.env.ENS_PROFILE_IMAGE_MAX_BYTES ?? 10_000_000)
  }
});

const chainFor = (chainId: number) => {
  if (chainId === base.id) return base;
  if (chainId === baseSepolia.id) return baseSepolia;
  if (chainId === celo.id) return celo;
  if (chainId === celoSepolia.id) return celoSepolia;
  return defaultChainId === base.id ? base : baseSepolia;
};

const registryClientFor = (chainId: number) =>
  createPublicClient({
    chain: chainFor(chainId),
    transport: http(chainId === baseSepolia.id ? baseSepoliaRpcUrl : baseRpcUrl)
  });

async function relayDelegatedRegistration(input: {
  walletAddress: string;
  chainId: number;
  fxThresholdBps?: number;
  riskTolerance?: string;
  preferredStablecoin?: string;
  telegramChat?: string;
  ensName?: string;
  registrationSignature?: string;
  registrationDeadline?: number;
}) {
  if (!merchantRegistryAddress || !isAddress(merchantRegistryAddress)) {
    throw new Error('merchant_registry_not_configured');
  }
  if (!registryRelayerPrivateKey) {
    throw new Error('registry_relayer_not_configured');
  }
  if (!input.registrationSignature || !input.registrationDeadline) {
    throw new Error('registration_signature_required');
  }

  const stablecoinSymbol = input.preferredStablecoin ?? 'USDC';
  const preferredStablecoin = stablecoinAddressFor(input.chainId, stablecoinSymbol);
  if (!preferredStablecoin) throw new Error('unsupported_stablecoin');

  const fxThresholdBps = input.fxThresholdBps ?? 50;
  const risk = riskValueFor(input.riskTolerance);
  const telegramChatId = keccak256(toBytes(input.telegramChat || input.ensName || input.walletAddress));

  const chain = chainFor(input.chainId);
  const publicClient = registryClientFor(input.chainId);
  const account = privateKeyToAccount(registryRelayerPrivateKey);
  const walletClient = createWalletClient({ account, chain, transport: http(baseRpcUrl) });

  const active = await publicClient.readContract({
    address: merchantRegistryAddress,
    abi: merchantRegistryAbi,
    functionName: 'isActive',
    args: [input.walletAddress as Address]
  });

  if (active) return { alreadyRegistered: true, transactionHash: undefined as Hex | undefined };

  const transactionHash = await walletClient.writeContract({
    address: merchantRegistryAddress,
    abi: merchantRegistryAbi,
    functionName: 'registerFor',
    args: [
      input.walletAddress as Address,
      fxThresholdBps,
      risk,
      preferredStablecoin,
      telegramChatId,
      BigInt(input.registrationDeadline),
      input.registrationSignature as Hex
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') throw new Error('delegated_registration_reverted');

  return { alreadyRegistered: false, transactionHash };
}

const labelFromEnsName = (ensName?: string) => {
  if (!ensName) return undefined;
  const normalized = ensName.toLowerCase().trim();
  const suffix = `.${ensParentName}`;
  if (!normalized.endsWith(suffix)) return undefined;
  const label = normalized.slice(0, -suffix.length);
  return ensLabelPattern.test(label) ? label : undefined;
};

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  agents: {
    monitorConfigured: Boolean(monitorAgentUrl),
    reportingConfigured: Boolean(reportingAgentUrl),
    decisionConfigured: Boolean(decisionAgentUrl),
    executionConfigured: Boolean(executionAgentUrl),
    gensynAxlMessagingConfigured: Boolean(axlMessagingUrl),
    gensynAxlNodeConfigured: Boolean(axlClient.nodeUrl),
    gensynAxlMode: axlClient.mode,
    registryRelayerConfigured: Boolean(registryRelayerPrivateKey)
  }
}));

const axlTraceLimit = Number(process.env.GENSYN_AXL_TRACE_LIMIT ?? 100);
type AxlTraceRecord = {
  workflowId: string;
  messageId: string;
  sequence: number;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  createdAt: string;
  mode: AxlMode;
  adapter?: unknown;
  axl?: AxlSendResult;
};
const axlTrace: AxlTraceRecord[] = [];
let axlSequence = 0;

function pushAxlTrace(record: AxlTraceRecord) {
  axlTrace.unshift(record);
  axlTrace.splice(axlTraceLimit);
}

app.get('/axl/status', async () => {
  let topology: unknown = null;
  let topologyError: string | undefined;

  if (axlClient.nodeUrl) {
    try {
      topology = await axlClient.topology();
    } catch (error) {
      topologyError = error instanceof Error ? error.message : 'axl_topology_failed';
    }
  }

  return {
    ok: true,
    mode: axlClient.mode,
    nodeConfigured: Boolean(axlClient.nodeUrl),
    messagingAdapterConfigured: Boolean(axlMessagingUrl),
    peers: {
      A1: Boolean(axlClient.peers.A1),
      A2: Boolean(axlClient.peers.A2),
      A3: Boolean(axlClient.peers.A3),
      A4: Boolean(axlClient.peers.A4)
    },
    services: {
      monitor: axlMonitorService,
      decision: axlDecisionService,
      execution: axlExecutionService,
      reporting: axlReportingService
    },
    fallbackToHttp: axlFallbackToHttp,
    topology,
    topologyError,
    recentMessages: axlTrace.slice(0, 25)
  };
});

type DashboardMonitorEvent = {
  agent: 'A1';
  type: 'ens-config' | 'merchant-lookup' | 'wallet-watch' | 'threshold-signal' | 'provision';
  merchant: string;
  ensName?: string;
  status: 'loaded' | 'not-found' | 'watching' | 'signal' | 'provisioned' | 'error';
  fxThresholdBps?: string;
  riskTolerance?: string;
  preferredStablecoin?: string;
  summary: string;
  timestamp: string;
};

type DashboardDecision = {
  agent: 'A2';
  workflowId?: string;
  merchant: string;
  action: 'HOLD' | 'CONVERT';
  confidence: number;
  spreadBps?: number;
  netScoreBps?: number;
  thresholdBps?: number;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  reason?: string;
  timestamp: string;
};

type DashboardExecution = {
  agent: 'A3';
  type: 'quote' | 'execution';
  workflowId?: string;
  merchant: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  rate?: number;
  status: string;
  quoteId?: string;
  txHash?: string | null;
  estimatedAmountOut?: string;
  timestamp: string;
};

type DashboardReport = {
  agent: 'A4';
  reportId: string;
  merchant: string;
  merchantEns?: string;
  decision: string;
  summary: string;
  storageUri?: string;
  contentHash?: string;
  txHash?: string;
  savingsEstimateUsd?: string;
  timestamp: string;
};

const asNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseAmount = (value: unknown) => asNumber(value);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || (payload as { ok?: boolean }).ok === false) {
    throw new Error(`get_failed:${response.status}`);
  }

  return payload as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(`post_failed:${response.status}`);
  }

  return payload as T;
}

async function emitAxlMessage(input: {
  workflowId: string;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const sequence = ++axlSequence;
  const messageId = randomUUID();
  const createdAt = new Date().toISOString();
  const envelope = {
    ...input,
    messageId,
    sequence,
    createdAt,
    metadata: {
      ...(input.metadata ?? {}),
      orchestrator: 'A0',
      mode: axlClient.mode
    }
  };

  let adapter: unknown = null;
  if (axlMessagingUrl) {
    try {
      adapter = await postJson(`${axlMessagingUrl.replace(/\/$/, '')}/axl/messages`, input);
    } catch (error) {
      app.log.warn({ error, messageType: input.messageType }, 'Gensyn AXL messaging adapter unavailable');
      adapter = { ok: false, error: 'messaging_adapter_unavailable' };
    }
  }

  let axl: AxlSendResult | undefined;
  if (axlClient.enabled) {
    const peerId = axlClient.peerForAgent(input.toAgent);
    try {
      axl = await axlClient.send(peerId, envelope);
    } catch (error) {
      axl = {
        ok: false,
        mode: axlClient.mode,
        transport: 'axl-send',
        peerId,
        error: error instanceof Error ? error.message : 'axl_send_failed'
      };
    }
  }

  pushAxlTrace({
    workflowId: input.workflowId,
    messageId,
    sequence,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    messageType: input.messageType,
    createdAt,
    mode: axlClient.mode,
    adapter,
    axl
  });

  return { ok: true, messageId, sequence, adapter, axl };
}

async function publishOnboardingReport(input: {
  onboardingId: string;
  ensName: string;
  walletAddress: string;
  registryTxHash?: string;
  fxThresholdBps?: number;
  riskTolerance?: string;
  preferredStablecoin?: string;
  ens: unknown;
}) {
  if (!reportingAgentUrl) return null;

  return callWorkflowAgent({
    agent: 'A4',
    service: axlReportingService,
    tool: 'publish_report',
    httpUrl: `${reportingAgentUrl.replace(/\/$/, '')}/reports/publish`,
    workflowId: input.onboardingId,
    payload: {
      reportId: input.onboardingId.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120),
      merchantEns: input.ensName,
      merchantWallet: input.walletAddress,
      decision: 'onboarding-complete',
      summary: 'Merchant treasury onboarding completed through Orchestrator and ENS Monitor.',
      transactionHash: input.registryTxHash,
      executionAgent: 'A0-Orchestrator',
      metadata: {
        fxThresholdBps: input.fxThresholdBps,
        riskTolerance: input.riskTolerance,
        preferredStablecoin: input.preferredStablecoin,
        ens: input.ens
      }
    }
  });
}

async function publishWorkflowReport(input: {
  workflowId: string;
  merchantEns: string;
  walletAddress: string;
  fromToken: string;
  toToken: string;
  amount: string;
  decision: unknown;
  execution: unknown;
  quote: unknown;
  merchantConfig?: unknown;
}) {
  if (!reportingAgentUrl) return null;

  const decisionRecord = input.decision as { decision?: { action?: string; reason?: string } };
  const executionRecord = input.execution as { transactionHash?: string | null; status?: string };
  const quoteRecord = input.quote as { quote?: { rate?: number } };
  const merchantConfig = input.merchantConfig && typeof input.merchantConfig === 'object'
    ? input.merchantConfig as { records?: Record<string, unknown> }
    : undefined;
  const telegramChatId = typeof merchantConfig?.records?.['counteragent.telegram_chat_id'] === 'string'
    ? merchantConfig.records['counteragent.telegram_chat_id']
    : undefined;
  const txHash = typeof executionRecord.transactionHash === 'string' ? executionRecord.transactionHash : undefined;

  return callWorkflowAgent({
    agent: 'A4',
    service: axlReportingService,
    tool: 'publish_report',
    httpUrl: `${reportingAgentUrl.replace(/\/$/, '')}/reports/publish`,
    workflowId: input.workflowId,
    payload: {
    reportId: input.workflowId.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120),
    merchantEns: input.merchantEns,
    merchantWallet: input.walletAddress,
    decision: decisionRecord.decision?.action ?? 'workflow-evaluated',
    summary: `Treasury workflow ${decisionRecord.decision?.action ?? 'evaluated'} for ${input.amount} ${input.fromToken} to ${input.toToken}.`,
    fxRate: quoteRecord.quote?.rate ? String(quoteRecord.quote.rate) : undefined,
    transactionHash: txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : undefined,
    executionAgent: 'A3-Uniswap-SwapExecution',
    metadata: {
      amount: input.amount,
      fromToken: input.fromToken,
      toToken: input.toToken,
      notification: { telegramChatId },
      merchantConfig,
      quote: input.quote,
      decision: input.decision,
      execution: input.execution
    }
    }
  });
}

async function lookupMerchantEns(walletAddress: string, workflowId?: string) {
  if (!monitorAgentUrl) return null;

  try {
    const payload = await callWorkflowAgent<{
      ok: boolean;
      name?: string;
      label?: string;
      node?: Hex;
      owner?: Address;
      resolver?: Address;
      address?: Address;
      merchantWallet?: Address;
      transactionHash?: Hex;
      blockNumber?: string;
      records?: Record<string, unknown>;
      error?: string;
    }>({
      agent: 'A1',
      service: axlMonitorService,
      tool: 'lookup_merchant_config',
      httpUrl: `${monitorAgentUrl.replace(/\/$/, '')}/ens/merchant/${walletAddress}`,
      httpMethod: 'GET',
      workflowId: workflowId ?? `merchant-lookup:${walletAddress.toLowerCase()}`,
      payload: { walletAddress }
    });

    if (!payload.ok) {
      app.log.info({ walletAddress, error: payload.error }, 'ENS merchant lookup unavailable');
      return null;
    }
    return payload;
  } catch (error) {
    app.log.warn({ error, walletAddress }, 'ENS merchant lookup failed');
    return null;
  }
}

app.post('/session/resolve', async (request, reply) => {
  const parsed = sessionResolveSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const { walletAddress, chainId } = parsed.data;

  if (!merchantRegistryAddress || !isAddress(merchantRegistryAddress)) {
    return reply.send({
      ok: true,
      route: 'onboarding',
      registered: false,
      reason: 'merchant_registry_not_configured'
    });
  }

  try {
    const client = registryClientFor(chainId);
    const registered = await client.readContract({
      address: merchantRegistryAddress,
      abi: merchantRegistryAbi,
      functionName: 'isActive',
      args: [walletAddress as Address]
    });

    if (!registered) {
      return reply.send({
        ok: true,
        route: 'onboarding',
        registered: false,
        reason: 'merchant_not_registered'
      });
    }

    const config = await client.readContract({
      address: merchantRegistryAddress,
      abi: merchantRegistryAbi,
      functionName: 'configOf',
      args: [walletAddress as Address]
    });

    const ens = await lookupMerchantEns(walletAddress);

    return reply.send({
      ok: true,
      route: 'dashboard',
      registered: true,
      merchant: {
        walletAddress,
        ensName: ens?.name,
        merchantEns: ens?.name,
        ens,
        fxThresholdBps: config.fxThresholdBps,
        risk: config.risk,
        preferredStablecoin: config.preferredStablecoin,
        telegramChatId: config.telegramChatId as Hex,
        active: config.active
      }
    });
  } catch (error) {
    request.log.error({ error }, 'session resolve failed');
    return reply.code(502).send({
      ok: false,
      error: 'registry_read_failed'
    });
  }
});

app.post('/ens/profile/records', async (request, reply) => {
  const parsed = ensProfileRecordSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  if (!monitorAgentUrl) {
    return reply.code(503).send({
      ok: false,
      error: 'ens_monitor_not_configured'
    });
  }

  try {
    const payload = await postJson<{ ok: true; records: Record<string, string>; note?: string }>(
      `${monitorAgentUrl.replace(/\/$/, '')}/ens/profile/records`,
      parsed.data
    );

    return reply.send({
      ...payload,
      preparedBy: 'A1-Monitor/Plugin-ENS-MerchantConfig'
    });
  } catch (error) {
    request.log.error({ error }, 'ENS profile record preparation failed');
    return reply.code(502).send({
      ok: false,
      error: 'ens_profile_record_preparation_failed'
    });
  }
});

app.post('/ens/profile/upload', async (request, reply) => {
  if (!monitorAgentUrl) {
    return reply.code(503).send({ ok: false, error: 'ens_monitor_not_configured' });
  }

  const file = await request.file();
  if (!file) {
    return reply.code(400).send({ ok: false, error: 'missing_file' });
  }

  try {
    const buffer = await file.toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.filename || 'ens-profile-image.png');

    const kind = typeof file.fields.kind === 'object' && 'value' in file.fields.kind ? String(file.fields.kind.value) : 'avatar';
    form.append('kind', kind);

    const response = await fetch(`${monitorAgentUrl.replace(/\/$/, '')}/ens/profile/upload`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.ok === false) {
      request.log.error({ status: response.status, payload }, 'ENS profile image upload via A1 failed');
      return reply.code(response.status >= 400 && response.status < 600 ? response.status : 502).send(payload);
    }

    return reply.send({
      ...payload,
      proxiedBy: 'A0-Orchestrator/Plugin-CounterAgent'
    });
  } catch (error) {
    request.log.error({ error }, 'ENS profile image upload proxy failed');
    return reply.code(502).send({ ok: false, error: 'ens_profile_image_upload_proxy_failed' });
  }
});

app.post('/onboarding/start', async (request, reply) => {
  const parsed = onboardingRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const onboarding = parsed.data;
  const onboardingId = onboarding.idempotencyKey
    ?? `${onboarding.chainId}:${onboarding.walletAddress.toLowerCase()}`;

  // TODO: Verify wallet signature or SIWE proof.
  // TODO: Verify registryTxHash against Base when present.

  const ensLabel = onboarding.ensLabel ?? labelFromEnsName(onboarding.ensName);

  if (!ensLabel) {
    return reply.code(400).send({
      ok: false,
      error: 'ens_label_required',
      message: `Provide ensLabel or an ensName under ${ensParentName}`
    });
  }

  let registryTxHash = onboarding.registryTxHash;

  if (!registryTxHash) {
    try {
      const registration = await relayDelegatedRegistration({
        walletAddress: onboarding.walletAddress,
        chainId: onboarding.chainId,
        fxThresholdBps: onboarding.fxThresholdBps,
        riskTolerance: onboarding.riskTolerance,
        preferredStablecoin: onboarding.preferredStablecoin,
        telegramChat: onboarding.telegramChat,
        ensName: onboarding.ensName ?? `${ensLabel}.${ensParentName}`,
        registrationSignature: onboarding.registrationSignature,
        registrationDeadline: onboarding.registrationDeadline
      });
      registryTxHash = registration.transactionHash;
      request.log.info({ onboardingId, registryTxHash, alreadyRegistered: registration.alreadyRegistered }, 'delegated registry registration complete');
    } catch (error) {
      request.log.error({ error, onboardingId }, 'delegated registry registration failed');
      return reply.code(502).send({
        ok: false,
        onboardingId,
        error: error instanceof Error ? error.message : 'delegated_registration_failed'
      });
    }
  }

  if (!monitorAgentUrl) {
    return reply.code(202).send({
      ok: true,
      onboardingId,
      status: 'accepted',
      next: 'ens-provisioning-pending',
      registryTxHash,
      ens: {
        label: ensLabel,
        name: `${ensLabel}.${ensParentName}`,
        status: 'monitor_agent_not_configured'
      }
    });
  }

  try {
    const response = await fetch(`${monitorAgentUrl.replace(/\/$/, '')}/ens/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: ensLabel,
        merchantWallet: onboarding.walletAddress,
        fxThresholdBps: onboarding.fxThresholdBps ?? 50,
        riskTolerance: onboarding.riskTolerance ?? 'moderate',
        preferredStablecoin: onboarding.preferredStablecoin ?? 'USDC',
        telegramChatId: onboarding.telegramChat ?? '',
        registryAddress: merchantRegistryAddress ?? ''
      })
    });

    const ens = await response.json().catch(() => ({}));

    if (!response.ok || !ens.ok) {
      request.log.error({ ens }, 'ENS provisioning rejected by Monitor');
      return reply.code(502).send({
        ok: false,
        onboardingId,
        error: 'ens_provision_failed',
        ens
      });
    }

    const ensName = `${ensLabel}.${ensParentName}`;
    let report: unknown = null;
    let reportWarning: string | undefined;

    try {
      report = await publishOnboardingReport({
        onboardingId,
        ensName,
        walletAddress: onboarding.walletAddress,
        registryTxHash,
        fxThresholdBps: onboarding.fxThresholdBps,
        riskTolerance: onboarding.riskTolerance,
        preferredStablecoin: onboarding.preferredStablecoin,
        ens
      });
    } catch (error) {
      request.log.error({ error }, 'A4 report publish failed');
      reportWarning = 'report_publish_failed';
    }

    return reply.send({
      ok: true,
      onboardingId,
      status: 'completed',
      next: 'dashboard',
      registryTxHash,
      ens,
      report,
      reportWarning
    });
  } catch (error) {
    request.log.error({ error }, 'Monitor ENS provisioning failed');
    return reply.code(502).send({
      ok: false,
      onboardingId,
      error: 'monitor_agent_unreachable'
    });
  }
});

app.post('/onboarding/prepare', async (request, reply) => {
  const parsed = onboardingPrepareSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  if (!merchantRegistryAddress || !isAddress(merchantRegistryAddress)) {
    return reply.code(503).send({ ok: false, error: 'merchant_registry_not_configured' });
  }

  const input = parsed.data;
  const stablecoin = stablecoinAddressFor(input.chainId, input.preferredStablecoin);
  if (!stablecoin) return reply.code(400).send({ ok: false, error: 'unsupported_stablecoin' });

  try {
    const client = registryClientFor(input.chainId);
    const nonce = await client.readContract({
      address: merchantRegistryAddress,
      abi: [
        {
          type: 'function',
          name: 'nonces',
          stateMutability: 'view',
          inputs: [{ name: 'merchant', type: 'address' }],
          outputs: [{ type: 'uint256' }]
        }
      ] as const,
      functionName: 'nonces',
      args: [input.walletAddress as Address]
    });
    const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
    const telegramChatId = keccak256(toBytes(input.telegramChat || input.ensName || input.walletAddress));

    return reply.send({
      ok: true,
      domain: {
        name: 'CounterAgent MerchantRegistry',
        version: '1',
        chainId: chainFor(input.chainId).id,
        verifyingContract: merchantRegistryAddress
      },
      types: {
        Register: [
          { name: 'merchant', type: 'address' },
          { name: 'fxThresholdBps', type: 'uint16' },
          { name: 'risk', type: 'uint8' },
          { name: 'preferredStablecoin', type: 'address' },
          { name: 'telegramChatId', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      primaryType: 'Register',
      message: {
        merchant: input.walletAddress,
        fxThresholdBps: input.fxThresholdBps,
        risk: riskValueFor(input.riskTolerance),
        preferredStablecoin: stablecoin,
        telegramChatId,
        nonce: nonce.toString(),
        deadline
      }
    });
  } catch (error) {
    request.log.error({ error }, 'onboarding prepare failed');
    return reply.code(502).send({ ok: false, error: 'registration_prepare_failed' });
  }
});

app.post('/vault/plan', async (request, reply) => {
  const parsed = vaultPlanSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const input = parsed.data;
  const chainId = input.chainId ?? defaultChainId;
  const chain = chainFor(chainId);
  const preferredSymbol = input.preferredStablecoin ?? defaultStablecoinForChain(chain.id);
  const stablecoin = stablecoinAddressFor(chain.id, preferredSymbol);
  if (!stablecoin) {
    return reply.code(400).send({ ok: false, error: 'unsupported_stablecoin_for_chain', chainId: chain.id, preferredStablecoin: preferredSymbol });
  }
  const tokenAllowlist = Object.entries(stablecoinsForChain(chain.id)).map(([symbol, address]) => ({ symbol, address }));
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60;
  const policy = vaultModePolicies[input.mode];
  const targetAllowlist = input.targetAllowlist ?? [];
  const authorizedAgent = input.authorizedAgent ?? (executionAgentAddress && isAddress(executionAgentAddress) ? executionAgentAddress : undefined);

  return reply.send({
    ok: true,
    status: 'draft',
    custodyModel: 'merchant-owned-non-custodial',
    chainId: chain.id,
    vault: {
      deployedAddressRequired: false,
      owner: input.walletAddress,
      authorizedAgent: authorizedAgent ?? null,
      authorizedAgentRole: 'A3-Uniswap-SwapExecution',
      tokenAllowlist,
      targetAllowlist,
      preferredStablecoin: {
        symbol: preferredSymbol,
        address: stablecoin
      },
      policy: {
        mode: input.mode,
        maxTradeAmount: policy.maxTradeAmount,
        dailyLimit: policy.dailyLimit,
        maxSlippageBps: policy.maxSlippageBps,
        expiresAt,
        active: true
      }
    },
    intent: {
      domain: {
        name: 'CounterAgent Autopilot Vault',
        version: '1',
        chainId: chain.id
      },
      types: {
        VaultPolicy: [
          { name: 'owner', type: 'address' },
          { name: 'authorizedAgent', type: 'address' },
          { name: 'preferredStablecoin', type: 'address' },
          { name: 'maxTradeAmount', type: 'uint256' },
          { name: 'dailyLimit', type: 'uint256' },
          { name: 'maxSlippageBps', type: 'uint16' },
          { name: 'expiresAt', type: 'uint64' },
          { name: 'targetAllowlistHash', type: 'bytes32' }
        ]
      },
      primaryType: 'VaultPolicy',
      message: {
        owner: input.walletAddress,
        authorizedAgent: authorizedAgent ?? '0x0000000000000000000000000000000000000000',
        preferredStablecoin: stablecoin,
        maxTradeAmount: policy.maxTradeAmount,
        dailyLimit: policy.dailyLimit,
        maxSlippageBps: policy.maxSlippageBps,
        expiresAt,
        targetAllowlistHash: keccak256(toBytes(targetAllowlist.join(',')))
      }
    },
    notes: [
      'A0 prepares policy intent only; it does not receive keys or custody funds.',
      'A3 is the intended authorized executor for no-human-in-the-loop swaps.',
      'The merchant owns the vault, signs bounded permissions, and can revoke or withdraw directly.'
    ]
  });
});


app.get('/dashboard/state', async (request, reply) => {
  const merchant = typeof (request.query as { merchant?: unknown }).merchant === 'string'
    ? (request.query as { merchant: string }).merchant
    : '';

  if (!isAddress(merchant)) {
    return reply.code(400).send({ ok: false, error: 'invalid_merchant' });
  }

  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 20), 50);
  const merchantParam = encodeURIComponent(merchant);
  const unavailable: string[] = [];

  const [monitorResult, decisionResult, executionResult, reportResult] = await Promise.allSettled([
    monitorAgentUrl
      ? getJson<{ monitor?: DashboardMonitorEvent[] }>(`${monitorAgentUrl.replace(/\/$/, '')}/monitor/recent?merchant=${merchantParam}&limit=${limit}`)
      : Promise.resolve({ monitor: [] as DashboardMonitorEvent[] }),
    decisionAgentUrl
      ? getJson<{ decisions?: DashboardDecision[] }>(`${decisionAgentUrl.replace(/\/$/, '')}/decision/recent?merchant=${merchantParam}&limit=${limit}`)
      : Promise.resolve({ decisions: [] as DashboardDecision[] }),
    executionAgentUrl
      ? getJson<{ swaps?: DashboardExecution[] }>(`${executionAgentUrl.replace(/\/$/, '')}/swap/recent?merchant=${merchantParam}&limit=${limit}`)
      : Promise.resolve({ swaps: [] as DashboardExecution[] }),
    reportingAgentUrl
      ? getJson<{ reports?: DashboardReport[] }>(`${reportingAgentUrl.replace(/\/$/, '')}/report/recent?merchant=${merchantParam}&limit=${limit}`)
      : Promise.resolve({ reports: [] as DashboardReport[] })
  ]);

  const monitor = monitorResult.status === 'fulfilled' ? monitorResult.value.monitor ?? [] : [];
  const decisions = decisionResult.status === 'fulfilled' ? decisionResult.value.decisions ?? [] : [];
  const executions = executionResult.status === 'fulfilled' ? executionResult.value.swaps ?? [] : [];
  const reports = reportResult.status === 'fulfilled' ? reportResult.value.reports ?? [] : [];

  if (monitorResult.status === 'rejected') unavailable.push('A1');
  if (decisionResult.status === 'rejected') unavailable.push('A2');
  if (executionResult.status === 'rejected') unavailable.push('A3');
  if (reportResult.status === 'rejected') unavailable.push('A4');

  const executionEvents = executions.filter((event) => event.type === 'execution');
  const swapsExecuted = executionEvents.filter((event) => ['dry-run', 'fallback-dry-run', 'executed', 'confirmed'].includes(event.status)).length;
  const volumeUsd = executionEvents.reduce((sum, event) => sum + parseAmount(event.amount), 0);
  const reportSavings = reports.reduce((sum, report) => sum + parseAmount(report.savingsEstimateUsd), 0);
  const fallbackSavings = executions.reduce((sum, event) => {
    const amount = parseAmount(event.amount);
    return event.type === 'execution' && event.status !== 'skipped' ? sum + amount * 0.0035 : sum;
  }, 0);
  const totalSavedUsd = reportSavings || fallbackSavings;

  return reply.send({
    ok: true,
    merchant,
    monitor,
    decisions,
    executions,
    reports,
    kpis: {
      totalSavedUsd: totalSavedUsd.toFixed(2),
      swapsExecuted,
      volumeUsd: volumeUsd.toFixed(2)
    },
    unavailable
  });
});

async function callWorkflowAgent<T>(input: {
  agent: 'A1' | 'A2' | 'A3' | 'A4';
  service: string;
  tool: string;
  payload: Record<string, unknown>;
  httpUrl: string;
  httpMethod?: 'GET' | 'POST';
  workflowId: string;
}) {
  if (axlClient.mode === 'transport') {
    const peerId = axlClient.peers[input.agent];
    const result = await axlClient.callMcp<T>({
      peerId,
      service: input.service,
      tool: input.tool,
      arguments: input.payload,
      id: `${input.workflowId}:${input.tool}`
    });

    if (result.ok && result.result) {
      return result.result;
    }

    app.log.warn({ result, agent: input.agent, tool: input.tool }, 'AXL transport unavailable for workflow agent');
    if (!axlFallbackToHttp) throw new Error(result.error ?? 'axl_transport_failed');
  }

  if (input.httpMethod === 'GET') {
    return getJson<T>(input.httpUrl);
  }

  return postJson<T>(input.httpUrl, input.payload);
}

app.post('/workflow/evaluate', async (request, reply) => {
  const parsed = workflowSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  if (!executionAgentUrl || !decisionAgentUrl) {
    return reply.code(503).send({
      ok: false,
      error: 'workflow_agents_not_configured',
      agents: {
        decisionConfigured: Boolean(decisionAgentUrl),
        executionConfigured: Boolean(executionAgentUrl)
      }
    });
  }

  const workflow = parsed.data;
  const workflowId = workflow.idempotencyKey
    ?? workflow.workflowId
    ?? `${workflow.chainId ?? defaultChainId}:${workflow.walletAddress.toLowerCase()}:${Date.now()}`;
  let merchantEns = workflow.merchantEns ?? `${workflow.walletAddress.toLowerCase()}.${ensParentName}`;
  let merchantConfig: unknown = null;

  try {
    await emitAxlMessage({
      workflowId,
      fromAgent: 'A0-Orchestrator',
      toAgent: 'A1-Monitor',
      messageType: 'merchant-config-request',
      payload: { walletAddress: workflow.walletAddress }
    });

    merchantConfig = await lookupMerchantEns(workflow.walletAddress, workflowId);
    const loadedMerchantEns = merchantConfig && typeof merchantConfig === 'object' && 'name' in merchantConfig
      ? (merchantConfig as { name?: unknown }).name
      : undefined;
    if (typeof loadedMerchantEns === 'string' && loadedMerchantEns) {
      merchantEns = loadedMerchantEns;
    }

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A1-Monitor',
      toAgent: 'A0-Orchestrator',
      messageType: 'merchant-config-response',
      payload: {
        found: Boolean(merchantConfig),
        merchantEns
      }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A0-Orchestrator',
      toAgent: 'A3-Uniswap-SwapExecution',
      messageType: 'quote-request',
      payload: {
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        slippageBps: workflow.slippageBps
      }
    });

    const quote = await callWorkflowAgent<{
      ok: boolean;
      workflowId?: string;
      quote: {
        provider?: string;
        rate: number;
        baselineRate?: number;
        feeBps?: number;
        priceImpactBps?: number;
        [key: string]: unknown;
      };
    }>({
      agent: 'A3',
      service: axlExecutionService,
      tool: 'get_quote',
      httpUrl: `${executionAgentUrl.replace(/\/$/, '')}/execution/quote`,
      workflowId,
      payload: {
        workflowId,
        merchantWallet: workflow.walletAddress,
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        slippageBps: workflow.slippageBps,
        dryRunRate: workflow.dryRunRate,
        baselineRate: workflow.baselineRate
      }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A3-Uniswap-SwapExecution',
      toAgent: 'A0-Orchestrator',
      messageType: 'quote-response',
      payload: { quote: quote.quote }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A0-Orchestrator',
      toAgent: 'A2-Decision',
      messageType: 'decision-request',
      payload: {
        quote: quote.quote,
        fxThresholdBps: workflow.fxThresholdBps,
        riskTolerance: workflow.riskTolerance
      }
    });

    const decision = await callWorkflowAgent<{
      ok: boolean;
      decision: {
        action: 'HOLD' | 'CONVERT';
        confidence: number;
        reason: string;
        [key: string]: unknown;
      };
    }>({
      agent: 'A2',
      service: axlDecisionService,
      tool: 'evaluate_decision',
      httpUrl: `${decisionAgentUrl.replace(/\/$/, '')}/decision/evaluate`,
      workflowId,
      payload: {
        workflowId,
        merchantEns,
        merchantWallet: workflow.walletAddress,
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        fxThresholdBps: workflow.fxThresholdBps,
        riskTolerance: workflow.riskTolerance,
        quote: {
          provider: quote.quote.provider,
          rate: quote.quote.rate,
          baselineRate: quote.quote.baselineRate ?? workflow.baselineRate,
          feeBps: quote.quote.feeBps ?? 0,
          priceImpactBps: quote.quote.priceImpactBps ?? 0,
          routeDiagnostics: quote.quote.routeDiagnostics
        },
        metadata: workflow.metadata
      }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A2-Decision',
      toAgent: 'A0-Orchestrator',
      messageType: 'decision-response',
      payload: { decision: decision.decision }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A0-Orchestrator',
      toAgent: 'A3-Uniswap-SwapExecution',
      messageType: 'execution-request',
      payload: {
        action: decision.decision.action,
        confidence: decision.decision.confidence
      }
    });

    const execution = await callWorkflowAgent<{
      ok: boolean;
      status: string;
      transactionHash?: string | null;
      [key: string]: unknown;
    }>({
      agent: 'A3',
      service: axlExecutionService,
      tool: 'execute_swap',
      httpUrl: `${executionAgentUrl.replace(/\/$/, '')}/execution/execute`,
      workflowId,
      payload: {
        workflowId,
        merchantWallet: workflow.walletAddress,
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        slippageBps: workflow.slippageBps,
        dryRunRate: workflow.dryRunRate,
        baselineRate: workflow.baselineRate,
        idempotencyKey: workflow.idempotencyKey,
        quoteId: quote.quote.quoteId,
        decision: {
          action: decision.decision.action,
          confidence: decision.decision.confidence
        }
      }
    });

    await emitAxlMessage({
      workflowId,
      fromAgent: 'A3-Uniswap-SwapExecution',
      toAgent: 'A0-Orchestrator',
      messageType: 'execution-response',
      payload: {
        status: execution.status,
        transactionHash: execution.transactionHash
      }
    });

    let report: unknown = null;
    let reportWarning: string | undefined;

    try {
      await emitAxlMessage({
        workflowId,
        fromAgent: 'A0-Orchestrator',
        toAgent: 'A4-Reporting',
        messageType: 'report-request',
        payload: {
          merchantEns,
          decision: decision.decision.action,
          executionStatus: execution.status
        }
      });

      report = await publishWorkflowReport({
        workflowId,
        merchantEns,
        walletAddress: workflow.walletAddress,
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        quote,
        decision,
        execution,
        merchantConfig
      });

      await emitAxlMessage({
        workflowId,
        fromAgent: 'A4-Reporting',
        toAgent: 'A0-Orchestrator',
        messageType: 'report-response',
        payload: { report }
      });
    } catch (error) {
      request.log.error({ error }, 'A4 workflow report publish failed');
      reportWarning = 'report_publish_failed';
    }

    return reply.send({
      ok: true,
      workflowId,
      status: execution.status === 'dry-run' ? 'dry-run-completed' : 'completed',
      quote,
      decision,
      execution,
      merchantConfig,
      report,
      reportWarning
    });
  } catch (error) {
    request.log.error({ error }, 'Workflow evaluation failed');
    return reply.code(502).send({
      ok: false,
      workflowId,
      error: 'workflow_evaluation_failed'
    });
  }
});

await app.listen({ port, host: '0.0.0.0' });
