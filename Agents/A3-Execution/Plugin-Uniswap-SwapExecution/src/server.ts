import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { isAddress, parseUnits, type Address } from 'viem';
import { z } from 'zod';
import { UniswapApiError, UniswapTradingApiClient, type StablecoinSymbol, type TokenConfig } from './uniswap.js';

const tokenSchema = z.enum(['USDC', 'EURC', 'USDT']);
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;

const baseMainnetTokens: Record<StablecoinSymbol, TokenConfig> = {
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

const swapBuildSchema = z.object({
  quote: z.unknown(),
  permitData: z.unknown().optional(),
  signature: z.string().regex(/^0x[a-fA-F0-9]*$/).optional()
});

const port = Number(process.env.PORT ?? 8791);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const executionMode = (process.env.EXECUTION_MODE ?? 'dry-run').toLowerCase();
const quoteMode = (process.env.UNISWAP_QUOTE_MODE ?? 'api-first').toLowerCase();
const uniswapApiUrl = process.env.UNISWAP_API_URL ?? 'https://trade-api.gateway.uniswap.org/v1';
const uniswapApiKey = process.env.UNISWAP_API_KEY;
const uniswapApiKeyConfigured = Boolean(uniswapApiKey && !uniswapApiKey.includes('<'));
const chainId = Number(process.env.CHAIN_ID ?? 84532);
const keeperHubConfigured = Boolean(process.env.KEEPERHUB_API_URL && process.env.KEEPERHUB_API_KEY);
const executorConfigured = Boolean(process.env.EXECUTOR_PRIVATE_KEY && !process.env.EXECUTOR_PRIVATE_KEY.includes('<'));

const uniswap = new UniswapTradingApiClient({
  baseUrl: uniswapApiUrl,
  apiKey: uniswapApiKey,
  retryCount: Number(process.env.UNISWAP_RETRY_COUNT ?? 2),
  timeoutMs: Number(process.env.UNISWAP_TIMEOUT_MS ?? 10_000)
});

const app = Fastify({ logger: true });

type QuoteSource = 'uniswap-trading-api' | 'counteragent-oracle-fallback' | 'uniswap-api-unavailable-fallback';

type CounterAgentQuote = {
  quoteId: string;
  provider: QuoteSource;
  route: string[];
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountInRaw: string;
  estimatedAmountOut: string;
  estimatedAmountOutRaw: string;
  rate: number;
  baselineRate: number;
  feeBps: number;
  priceImpactBps: number;
  slippageBps: number;
  executable: boolean;
  dryRun: boolean;
  fallbackReason?: string;
  apiAttempted: boolean;
  apiStatus?: number;
  apiError?: string;
  rawQuote?: unknown;
};

type RecentSwap = {
  agent: 'A3';
  type: 'quote' | 'execution' | 'swap-build';
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
  provider?: QuoteSource | 'uniswap-trading-api';
  fallbackReason?: string;
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

function envAddress(name: string) {
  const value = process.env[name];
  return value && isAddress(value) ? (value as Address) : undefined;
}

function tokenConfig(symbol: StablecoinSymbol): TokenConfig {
  const override = envAddress(`${symbol}_TOKEN_ADDRESS`) ?? envAddress(`${symbol}_TOKEN_ADDRESS_${chainId}`);
  return { ...baseMainnetTokens[symbol], address: override ?? baseMainnetTokens[symbol].address };
}

function amountToNumber(amount: string) {
  const parsed = Number(amount.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function fallbackRate(input: z.infer<typeof quoteSchema>) {
  if (input.fromToken === input.toToken) return 1;
  return input.dryRunRate ?? input.baselineRate ?? 1;
}

function buildFallbackQuote(input: z.infer<typeof quoteSchema>, details?: { reason?: string; apiAttempted?: boolean; apiStatus?: number; apiError?: string }): CounterAgentQuote {
  const rate = fallbackRate(input);
  const amountIn = amountToNumber(input.amount);
  const feeBps = input.fromToken === input.toToken ? 0 : Number(process.env.FALLBACK_FEE_BPS ?? 5);
  const priceImpactBps = input.fromToken === input.toToken ? 0 : Number(process.env.FALLBACK_PRICE_IMPACT_BPS ?? 0);
  const amountOut = amountIn > 0 ? (amountIn * rate * (10_000 - feeBps - priceImpactBps)) / 10_000 : 0;
  const fromToken = tokenConfig(input.fromToken);
  const toToken = tokenConfig(input.toToken);
  const amountInRaw = parseUnits(input.amount.replace(/,/g, ''), fromToken.decimals).toString();
  const estimatedAmountOutRaw = parseUnits(amountOut.toFixed(toToken.decimals), toToken.decimals).toString();
  const fallbackReason = details?.reason ?? (input.dryRunRate || input.baselineRate ? 'oracle_or_user_rate_fallback' : 'no_market_rate_available');
  const quoteId = createHash('sha256')
    .update(JSON.stringify({ ...input, chainId, rate, feeBps, priceImpactBps, fallbackReason }))
    .digest('hex')
    .slice(0, 24);

  return {
    quoteId,
    provider: details?.apiAttempted ? 'uniswap-api-unavailable-fallback' : 'counteragent-oracle-fallback',
    route: [input.fromToken, input.toToken],
    tokenIn: fromToken.address,
    tokenOut: toToken.address,
    amountIn: input.amount,
    amountInRaw,
    estimatedAmountOut: amountOut ? amountOut.toFixed(toToken.decimals) : '0',
    estimatedAmountOutRaw,
    rate,
    baselineRate: input.baselineRate ?? 1,
    feeBps,
    priceImpactBps,
    slippageBps: input.slippageBps,
    executable: false,
    dryRun: true,
    fallbackReason,
    apiAttempted: Boolean(details?.apiAttempted),
    apiStatus: details?.apiStatus,
    apiError: details?.apiError
  };
}

async function buildQuote(input: z.infer<typeof quoteSchema>): Promise<CounterAgentQuote> {
  if (!uniswapApiKeyConfigured || quoteMode === 'fallback-only') {
    return buildFallbackQuote(input, {
      reason: uniswapApiKeyConfigured ? 'fallback_only_mode' : 'uniswap_api_key_not_configured',
      apiAttempted: false
    });
  }

  try {
    const apiQuote = await uniswap.quote({
      merchantWallet: input.merchantWallet as Address,
      chainId,
      fromToken: tokenConfig(input.fromToken),
      toToken: tokenConfig(input.toToken),
      amount: input.amount,
      slippageBps: input.slippageBps
    });

    return {
      ...apiQuote,
      provider: 'uniswap-trading-api',
      baselineRate: input.baselineRate ?? 1,
      executable: executionMode !== 'dry-run' && executorConfigured,
      dryRun: executionMode === 'dry-run',
      apiAttempted: true
    };
  } catch (error) {
    const apiError = error instanceof UniswapApiError ? error : undefined;
    app.log.warn({ error, chainId }, 'Uniswap Trading API quote failed; falling back to CounterAgent oracle quote');
    return buildFallbackQuote(input, {
      reason: apiError?.status === 404 ? `uniswap_trading_api_unsupported_or_no_route_chain_${chainId}` : 'uniswap_trading_api_quote_failed',
      apiAttempted: true,
      apiStatus: apiError?.status,
      apiError: error instanceof Error ? error.message : 'uniswap_unknown_error'
    });
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
  quoteMode,
  integrations: {
    uniswapApiConfigured: Boolean(uniswapApiUrl && uniswapApiKeyConfigured),
    uniswapApiUrl,
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
    status: quote.provider === 'uniswap-trading-api' ? 'quoted' : 'fallback-quote',
    quoteId: quote.quoteId,
    estimatedAmountOut: quote.estimatedAmountOut,
    provider: quote.provider,
    fallbackReason: quote.fallbackReason,
    timestamp: new Date().toISOString()
  });
  return reply.send({ ok: true, workflowId: parsed.data.workflowId, quote });
});

app.post('/execution/swap', async (request, reply) => {
  const parsed = swapBuildSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  if (!uniswapApiKeyConfigured) {
    return reply.code(503).send({ ok: false, error: 'uniswap_api_key_not_configured' });
  }

  try {
    const swap = await uniswap.buildSwap({
      quote: parsed.data.quote,
      permitData: parsed.data.permitData,
      signature: parsed.data.signature as `0x${string}` | undefined
    });

    return reply.send({
      ok: true,
      swap,
      message: 'Transaction data returned by Uniswap Trading API. The browser/wallet should sign and send it.'
    });
  } catch (error) {
    const apiError = error instanceof UniswapApiError ? error : undefined;
    app.log.warn({ error }, 'Uniswap Trading API swap build failed');
    return reply.code(apiError?.status && apiError.status < 500 ? 400 : 502).send({
      ok: false,
      error: 'uniswap_swap_build_failed',
      status: apiError?.status,
      message: error instanceof Error ? error.message : 'uniswap_unknown_error'
    });
  }
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

  if (executionMode === 'dry-run' || quote.provider !== 'uniswap-trading-api') {
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
      status: quote.provider === 'uniswap-trading-api' ? 'dry-run' : 'fallback-dry-run',
      quoteId: quote.quoteId,
      txHash: null,
      estimatedAmountOut: quote.estimatedAmountOut,
      provider: quote.provider,
      fallbackReason: quote.fallbackReason,
      timestamp: new Date().toISOString()
    });
    return reply.send({
      ok: true,
      workflowId: parsed.data.workflowId,
      status: quote.provider === 'uniswap-trading-api' ? 'dry-run' : 'fallback-dry-run',
      executionId,
      quote,
      transactionHash: null,
      message: quote.provider === 'uniswap-trading-api'
        ? 'Uniswap Trading API quote obtained; dry-run mode did not submit a transaction.'
        : 'Uniswap Trading API was unavailable for this route/chain; fallback quote used and no transaction was submitted.'
    });
  }

  if (!executorConfigured) {
    return reply.code(409).send({ ok: false, error: 'executor_not_configured' });
  }

  return reply.code(501).send({
    ok: false,
    error: 'server_side_live_execution_not_enabled',
    message: 'Use /execution/swap to build Uniswap Trading API transaction calldata for browser wallet signing; server-side custody remains intentionally disabled.'
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
