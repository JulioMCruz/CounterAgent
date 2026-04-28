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

const onboardingRequestSchema = z.object({
  walletAddress: z.string().refine(isAddress, 'Invalid wallet address'),
  chainId: z.number().int().positive(),
  merchantName: z.string().min(1).max(120),
  ensName: z.string().min(1).max(255).optional(),
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

app.get('/healthz', async () => ({ ok: true, status: 'live' }));

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
  // TODO: Coordinate MerchantRegistry + ENS provisioning through the Orchestrator runtime.
  // TODO: Hand off verified config to Monitor.

  return reply.code(202).send({
    ok: true,
    onboardingId,
    status: 'accepted',
    next: 'verify-registry'
  });
});

await app.listen({ port, host: '0.0.0.0' });
