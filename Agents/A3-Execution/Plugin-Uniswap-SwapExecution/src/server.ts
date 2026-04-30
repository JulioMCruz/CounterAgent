import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { isAddress, type Address } from 'viem';
import { z } from 'zod';
import { UniswapTradingApiClient, type StablecoinSymbol, type TokenConfig } from './uniswap.js';

const tokenSchema = z.enum(['USDC', 'EURC', 'USDT']);
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;

const tokenConfigs: Record<StablecoinSymbol, TokenConfig> = {
  USDC: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  EURC: { symbol: 'EURC', address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6 },
  USDT: { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 }
};

const quoteSchema = z.object({
  workflowId: z.string().min(1).max(120).optional(),
  merchantWallet: z.string().refine(isAddress, 'Invalid merchant wallet'),
  fromToken: tokenSchema,
  toToken: tokenSchema.default('USDC'),
  amount: z.string().min(1).max(80),
  slippageBps: z.number().int().min(1).max(1_000).default(50),
  dryRunRate: z.number().positive().optional(),
  baselineRate: z.number().positive().optional()
});

const executeSchema = quoteSchema.extend({
  decision: z.object({
    action: z.enum(['HOLD', 'CONVERT']),
    confidence: z.number().min(0).max(100)
  }),
  quoteId: z.string().min(1).max(120).optional(),
  idempotencyKey: z.string().min(1).max(160).optional()
});

const port = Number(process.env.PORT ?? 8791);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const executionMode = (process.env.EXECUTION_MODE ?? 'dry-run').toLowerCase();
const uniswapApiUrl = process.env.UNISWAP_API_URL ?? 'https://trade-api.gateway.uniswap.org/v1';
const uniswapApiKey = process.env.UNISWAP_API_KEY;
const uniswapApiKeyConfigured = Boolean(uniswapApiKey);
const chainId = Number(process.env.CHAIN_ID ?? 8453);
const keeperHubConfigured = Boolean(process.env.KEEPERHUB_API_URL && process.env.KEEPERHUB_API_KEY);
const executorConfigured = Boolean(process.env.EXECUTOR_PRIVATE_KEY);

const uniswap = new UniswapTradingApiClient({
  baseUrl: uniswapApiUrl,
  apiKey: uniswapApiKey,
  retryCount: Number(process.env.UNISWAP_RETRY_COUNT ?? 2),
  timeoutMs: Number(process.env.UNISWAP_TIMEOUT_MS ?? 10_000)
});

const app = Fastify({ logger: true });

type RecentSwap = {
  agent: 'A3';
  type: 'quote' | 'execution';
  workflowId?: string;
  merchant: string;
  fromToken: string;
  toToken: string;
  amount: string;
  rate?: number;
  status: string;
  quoteId?: string;
  txHash?: string | null;
  estimatedAmountOut?: string;
  timestamp: string;
};

const recentSwaps = new Map<string, RecentSwap[]>();
const recentLimit = Number(process.env.RECENT_EVENT_LIMIT ?? 20);
const merchantKey = (value: string) => value.toLowerCase();

function pushRecentSwap(event: RecentSwap) {
  const key = merchantKey(event.merchant);
  const items = recentSwaps.get(key) ?? [];
  items.unshift(event);
  recentSwaps.set(key, items.slice(0, recentLimit));
}

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

function estimateRate(fromToken: string, toToken: string, dryRunRate?: number) {
  if (dryRunRate) return dryRunRate;
  if (fromToken === toToken) return 1;
  if (fromToken === 'EURC' && toToken === 'USDC') return 1.0812;
  if (fromToken === 'USDT' && toToken === 'USDC') return 1.0003;
  if (fromToken === 'USDC' && toToken === 'EURC') return 0.9249;
  return 1;
}

function amountToNumber(amount: string) {
  const parsed = Number(amount.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildDryRunQuote(input: z.infer<typeof quoteSchema>) {
  const rate = estimateRate(input.fromToken, input.toToken, input.dryRunRate);
  const amountIn = amountToNumber(input.amount);
  const feeBps = input.fromToken === input.toToken ? 0 : 5;
  const priceImpactBps = input.fromToken === input.toToken ? 0 : 3;
  const amountOut = amountIn > 0 ? (amountIn * rate * (10_000 - feeBps - priceImpactBps)) / 10_000 : 0;
  const quoteId = createHash('sha256')
    .update(JSON.stringify({ ...input, rate, feeBps, priceImpactBps }))
    .digest('hex')
    .slice(0, 24);

  return {
    quoteId,
    provider: 'uniswap-dry-run',
    route: [input.fromToken, input.toToken],
    tokenIn: tokenConfigs[input.fromToken].address,
    tokenOut: tokenConfigs[input.toToken].address,
    amountIn: input.amount,
    estimatedAmountOut: amountOut ? amountOut.toFixed(6) : '0',
    rate,
    baselineRate: input.baselineRate ?? 1,
    feeBps,
    priceImpactBps,
    slippageBps: input.slippageBps,
    executable: executionMode !== 'dry-run' && executorConfigured,
    dryRun: true
  };
}

async function buildQuote(input: z.infer<typeof quoteSchema>) {
  // The plugin defaults to deterministic dry-run quotes so demos never move funds.
  // In live-quote mode it calls the Uniswap Trading API, then still gates transaction broadcast separately.
  if (executionMode === 'dry-run' || !uniswapApiKeyConfigured) {
    return buildDryRunQuote(input);
  }

  try {
    return await uniswap.quote({
      merchantWallet: input.merchantWallet as Address,
      chainId,
      fromToken: tokenConfigs[input.fromToken],
      toToken: tokenConfigs[input.toToken],
      amount: input.amount,
      slippageBps: input.slippageBps
    });
  } catch (error) {
    app.log.warn({ error }, 'Uniswap Trading API quote failed; falling back to dry-run quote');
    return { ...buildDryRunQuote(input), provider: 'uniswap-dry-run-fallback' };
  }
}

app.get('/swap/recent', async (request, reply) => {
  const merchant = typeof (request.query as { merchant?: unknown }).merchant === 'string'
    ? (request.query as { merchant: string }).merchant
    : '';

  if (!isAddress(merchant)) {
    return reply.code(400).send({ ok: false, error: 'invalid_merchant' });
  }

  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? recentLimit), recentLimit);
  return reply.send({ ok: true, merchant, swaps: (recentSwaps.get(merchantKey(merchant)) ?? []).slice(0, limit) });
});

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'execution',
  executionMode,
  integrations: {
    uniswapApiConfigured: Boolean(uniswapApiUrl && uniswapApiKeyConfigured),
    chainId,
    keeperHubConfigured,
    executorConfigured
  }
}));

app.post('/execution/quote', async (request, reply) => {
  const parsed = quoteSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  const quote = await buildQuote(parsed.data);
  pushRecentSwap({
    agent: 'A3',
    type: 'quote',
    workflowId: parsed.data.workflowId,
    merchant: parsed.data.merchantWallet,
    fromToken: parsed.data.fromToken,
    toToken: parsed.data.toToken,
    amount: parsed.data.amount,
    rate: quote.rate,
    status: 'dryRun' in quote && quote.dryRun ? 'dry-run-quote' : 'quoted',
    quoteId: quote.quoteId,
    estimatedAmountOut: quote.estimatedAmountOut,
    timestamp: new Date().toISOString()
  });
  return reply.send({ ok: true, workflowId: parsed.data.workflowId, quote });
});

app.post('/execution/execute', async (request, reply) => {
  const parsed = executeSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  if (parsed.data.decision.action !== 'CONVERT') {
    pushRecentSwap({
      agent: 'A3',
      type: 'execution',
      workflowId: parsed.data.workflowId,
      merchant: parsed.data.merchantWallet,
      fromToken: parsed.data.fromToken,
      toToken: parsed.data.toToken,
      amount: parsed.data.amount,
      status: 'skipped',
      txHash: null,
      timestamp: new Date().toISOString()
    });
    return reply.send({
      ok: true,
      workflowId: parsed.data.workflowId,
      status: 'skipped',
      reason: 'decision_was_hold',
      transactionHash: null
    });
  }

  const quote = await buildQuote(parsed.data);

  if (executionMode === 'dry-run') {
    const executionId = parsed.data.idempotencyKey ?? randomUUID();
    pushRecentSwap({
      agent: 'A3',
      type: 'execution',
      workflowId: parsed.data.workflowId,
      merchant: parsed.data.merchantWallet,
      fromToken: parsed.data.fromToken,
      toToken: parsed.data.toToken,
      amount: parsed.data.amount,
      rate: quote.rate,
      status: 'dry-run',
      quoteId: quote.quoteId,
      txHash: null,
      estimatedAmountOut: quote.estimatedAmountOut,
      timestamp: new Date().toISOString()
    });
    return reply.send({
      ok: true,
      workflowId: parsed.data.workflowId,
      status: 'dry-run',
      executionId,
      quote,
      transactionHash: null,
      message: 'Dry-run execution only; no transaction was submitted.'
    });
  }

  if (!executorConfigured) {
    return reply.code(409).send({ ok: false, error: 'executor_not_configured' });
  }

  return reply.code(501).send({
    ok: false,
    error: 'live_execution_not_enabled',
    message: 'Live Uniswap/KeeperHub execution is intentionally gated until executor credentials and adapter are reviewed.'
  });
});

app.post('/execution/confirm', async (request, reply) => {
  const schema = z.object({ transactionHash: z.string().regex(txHashPattern) });
  const parsed = schema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  return reply.send({
    ok: true,
    transactionHash: parsed.data.transactionHash,
    status: 'confirmation_pending',
    message: 'Confirmation adapter is not wired yet.'
  });
});

await app.listen({ port, host: '0.0.0.0' });
