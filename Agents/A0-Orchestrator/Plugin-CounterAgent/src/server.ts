import cors from '@fastify/cors';
import Fastify from 'fastify';
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
import { base, baseSepolia } from 'viem/chains';
import { z } from 'zod';

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

const tokenSchema = z.enum(['USDC', 'EURC', 'USDT']);
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
const defaultChainId = Number(process.env.DEFAULT_CHAIN_ID ?? 84532);
const monitorAgentUrl = process.env.MONITOR_AGENT_URL;
const reportingAgentUrl = process.env.REPORTING_AGENT_URL;
const decisionAgentUrl = process.env.DECISION_AGENT_URL;
const executionAgentUrl = process.env.EXECUTION_AGENT_URL;
const axlMessagingUrl = process.env.GENSYN_AXL_MESSAGING_URL;
const ensParentName = process.env.ENS_PARENT_NAME ?? 'counteragent.eth';

const stablecoinAddresses: Record<string, Address> = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  EURC: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
};

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

const chainFor = (chainId: number) => {
  if (chainId === base.id) return base;
  if (chainId === baseSepolia.id) return baseSepolia;
  return defaultChainId === base.id ? base : baseSepolia;
};

const registryClientFor = (chainId: number) =>
  createPublicClient({
    chain: chainFor(chainId),
    transport: http(baseRpcUrl)
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
  const preferredStablecoin = stablecoinAddresses[stablecoinSymbol];
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
    registryRelayerConfigured: Boolean(registryRelayerPrivateKey)
  }
}));

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
  if (!axlMessagingUrl) return null;

  try {
    return await postJson(`${axlMessagingUrl.replace(/\/$/, '')}/axl/messages`, input);
  } catch (error) {
    app.log.warn({ error, messageType: input.messageType }, 'Gensyn AXL messaging adapter unavailable');
    return null;
  }
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

  const response = await fetch(`${reportingAgentUrl.replace(/\/$/, '')}/reports/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
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
    })
  });

  const report = await response.json().catch(() => ({}));

  if (!response.ok || !report.ok) {
    throw new Error('report_publish_failed');
  }

  return report;
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
}) {
  if (!reportingAgentUrl) return null;

  const decisionRecord = input.decision as { decision?: { action?: string; reason?: string } };
  const executionRecord = input.execution as { transactionHash?: string | null; status?: string };
  const quoteRecord = input.quote as { quote?: { rate?: number } };
  const txHash = typeof executionRecord.transactionHash === 'string' ? executionRecord.transactionHash : undefined;

  return postJson(`${reportingAgentUrl.replace(/\/$/, '')}/reports/publish`, {
    reportId: input.workflowId.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120),
    merchantEns: input.merchantEns,
    merchantWallet: input.walletAddress,
    decision: decisionRecord.decision?.action ?? 'workflow-evaluated',
    summary: `Treasury workflow ${decisionRecord.decision?.action ?? 'evaluated'} for ${input.amount} ${input.fromToken} to ${input.toToken}.`,
    fxRate: quoteRecord.quote?.rate ? String(quoteRecord.quote.rate) : undefined,
    transactionHash: txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : undefined,
    executionAgent: 'A3-Uniswap-SwapExecution',
    metadata: {
      quote: input.quote,
      decision: input.decision,
      execution: input.execution
    }
  });
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

    return reply.send({
      ok: true,
      route: 'dashboard',
      registered: true,
      merchant: {
        walletAddress,
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
  const stablecoin = stablecoinAddresses[input.preferredStablecoin];
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
  const merchantEns = workflow.merchantEns ?? `${workflow.walletAddress.toLowerCase()}.${ensParentName}`;

  try {
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

    const quote = await postJson<{
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
    }>(`${executionAgentUrl.replace(/\/$/, '')}/execution/quote`, {
      workflowId,
      merchantWallet: workflow.walletAddress,
      fromToken: workflow.fromToken,
      toToken: workflow.toToken,
      amount: workflow.amount,
      slippageBps: workflow.slippageBps,
      dryRunRate: workflow.dryRunRate,
      baselineRate: workflow.baselineRate
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

    const decision = await postJson<{
      ok: boolean;
      decision: {
        action: 'HOLD' | 'CONVERT';
        confidence: number;
        reason: string;
        [key: string]: unknown;
      };
    }>(`${decisionAgentUrl.replace(/\/$/, '')}/decision/evaluate`, {
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
        priceImpactBps: quote.quote.priceImpactBps ?? 0
      },
      metadata: workflow.metadata
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

    const execution = await postJson<{
      ok: boolean;
      status: string;
      transactionHash?: string | null;
      [key: string]: unknown;
    }>(`${executionAgentUrl.replace(/\/$/, '')}/execution/execute`, {
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
      report = await publishWorkflowReport({
        workflowId,
        merchantEns,
        walletAddress: workflow.walletAddress,
        fromToken: workflow.fromToken,
        toToken: workflow.toToken,
        amount: workflow.amount,
        quote,
        decision,
        execution
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
