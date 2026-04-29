import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type Hex
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { z } from 'zod';

const merchantRegistryAbi = [
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
  callbackUrl: z.string().url().optional(),
  idempotencyKey: z.string().min(8).max(120).optional()
});

const port = Number(process.env.PORT ?? 8787);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const merchantRegistryAddress = process.env.MERCHANT_REGISTRY_ADDRESS as Address | undefined;
const baseRpcUrl = process.env.BASE_RPC_URL || 'https://sepolia.base.org';
const defaultChainId = Number(process.env.DEFAULT_CHAIN_ID ?? 84532);
const monitorAgentUrl = process.env.MONITOR_AGENT_URL;
const reportingAgentUrl = process.env.REPORTING_AGENT_URL;
const ensParentName = process.env.ENS_PARENT_NAME ?? 'counteragent.eth';

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
    reportingConfigured: Boolean(reportingAgentUrl)
  }
}));

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

  if (!monitorAgentUrl) {
    return reply.code(202).send({
      ok: true,
      onboardingId,
      status: 'accepted',
      next: 'ens-provisioning-pending',
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
        registryTxHash: onboarding.registryTxHash,
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

await app.listen({ port, host: '0.0.0.0' });
