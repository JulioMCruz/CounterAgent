import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, formatUnits, http, isAddress, parseAbi, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { UniswapApiError, UniswapTradingApiClient, type RouteDiagnostics, type StablecoinSymbol, type TokenConfig } from './uniswap.js';

const tokenSchema = z.enum(['USDC', 'EURC', 'USDT', 'CUSD', 'CEUR', 'CELO']);
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;

const defaultTokenAddress = '0x0000000000000000000000000000000000000000' as Address;

const chainTokens: Record<number, Partial<Record<StablecoinSymbol, TokenConfig>>> = {
  1: {
    USDC: { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    EURC: { symbol: 'EURC', address: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c', decimals: 6 },
    USDT: { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
  },
  8453: {
    USDC: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    EURC: { symbol: 'EURC', address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6 },
    USDT: { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 }
  },
  84532: {
    USDC: { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
    EURC: { symbol: 'EURC', address: '0x808456652fdb597867f38412077A9182bf77359F', decimals: 6 }
  },
  42220: {
    CELO: { symbol: 'CELO', address: '0x471EcE3750Da237f93B8E339c536989b8978a438', decimals: 18 },
    USDC: { symbol: 'USDC', address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6 },
    USDT: { symbol: 'USDT', address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },
    CUSD: { symbol: 'CUSD', address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
    CEUR: { symbol: 'CEUR', address: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73', decimals: 18 }
  },
  44787: {
    CELO: { symbol: 'CELO', address: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1', decimals: 18 },
    CUSD: { symbol: 'CUSD', address: '0x62492A644A588FD904270BeD06ad52B9abfEA1aE', decimals: 18 },
    CEUR: { symbol: 'CEUR', address: '0xf9ecE301247aD2CE21894941830A2470f4E774ca', decimals: 18 }
  },
  11142220: {
    USDC: { symbol: 'USDC', address: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', decimals: 6 },
    USDT: { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6 },
    CUSD: { symbol: 'CUSD', address: '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80', decimals: 18 },
    CEUR: { symbol: 'CEUR', address: '0x6B172e333e2978484261D7eCC3DE491E79764BbC', decimals: 18 }
  }
};

const jsonRpcSchema = z.object({
  jsonrpc: z.string().optional(),
  id: z.unknown().optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional().default({})
});

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
  vaultAddress: z.string().refine(isAddress, 'Invalid vault address').optional(),
  routerCalldata: z.string().regex(/^0x[a-fA-F0-9]*$/).optional(),
  quoteId: z.string().min(1).max(120).optional(),
  idempotencyKey: z.string().min(1).max(160).optional()
});

const swapBuildSchema = z.object({
  quote: z.unknown(),
  permitData: z.unknown().optional(),
  signature: z.string().regex(/^0x[a-fA-F0-9]*$/).optional()
});

function envAddress(name: string) {
  const value = process.env[name];
  return value && isAddress(value) ? (value as Address) : undefined;
}

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
function defaultRpcUrl(id: number) {
  if (id === 1) return process.env.ETHEREUM_RPC_URL ?? 'https://eth.llamarpc.com';
  if (id === 8453) return process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  if (id === 42220) return process.env.CELO_RPC_URL ?? 'https://forno.celo.org';
  if (id === 44787) return process.env.CELO_ALFAJORES_RPC_URL ?? 'https://alfajores-forno.celo-testnet.org';
  if (id === 11142220) return process.env.CELO_SEPOLIA_RPC_URL ?? 'https://forno.celo-sepolia.celo-testnet.org';
  return process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL ?? 'https://sepolia.base.org';
}
const rpcUrl = process.env.RPC_URL ?? defaultRpcUrl(chainId);
const keeperHubConfigured = Boolean(process.env.KEEPERHUB_API_URL && process.env.KEEPERHUB_API_KEY);
const executorConfigured = Boolean(process.env.EXECUTOR_PRIVATE_KEY && !process.env.EXECUTOR_PRIVATE_KEY.includes('<'));
const treasuryVaultFactoryAddress = envAddress('TREASURY_VAULT_FACTORY_ADDRESS');
const universalRouterAddress = envAddress(`UNIVERSAL_ROUTER_ADDRESS_${chainId}`) ?? envAddress('UNIVERSAL_ROUTER_ADDRESS');
const permit2Address = envAddress(`PERMIT2_ADDRESS_${chainId}`) ?? envAddress('PERMIT2_ADDRESS') ?? '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const uniswap = new UniswapTradingApiClient({
  baseUrl: uniswapApiUrl,
  apiKey: uniswapApiKey,
  retryCount: Number(process.env.UNISWAP_RETRY_COUNT ?? 2),
  timeoutMs: Number(process.env.UNISWAP_TIMEOUT_MS ?? 10_000)
});

const app = Fastify({ logger: true });

type QuoteSource = 'uniswap-trading-api' | 'uniswap-v4-pool-fallback' | 'counteragent-oracle-fallback' | 'uniswap-api-unavailable-fallback';

const publicClient = createPublicClient({
  transport: http(rpcUrl),
  chain: {
    id: chainId,
    name: chainId === 84532 ? 'Base Sepolia' : 'Configured Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  }
});

const v4QuoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) external returns (uint256 amountOut,uint256 gasEstimate)'
]);

const treasuryVaultFactoryAbi = parseAbi([
  'function vaultOf(address merchant) view returns (address)',
  'function predictedVault(address merchant) view returns (address)'
]);

const treasuryVaultAbi = parseAbi([
  'function allowedTarget(address target) view returns (bool)',
  'function executeCall(address target,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 expectedAmountOut,uint16 slippageBps,bytes data) returns (bytes result)'
]);

const universalRouterAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'
]);

const erc20AllowanceAbi = parseAbi([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
]);

const permit2Abi = parseAbi([
  'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)',
  'function approve(address token,address spender,uint160 amount,uint48 expiration)'
]);

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
  routeDiagnostics: RouteDiagnostics;
  rawQuote?: unknown;
};

const quoteTtlMs = Number(process.env.UNISWAP_QUOTE_TTL_MS ?? 20_000);

function quoteValidUntil() {
  return new Date(Date.now() + quoteTtlMs).toISOString();
}

function routeDiagnosticsFor(input: z.infer<typeof quoteSchema>, args: {
  source: RouteDiagnostics['source'];
  tokenIn: Address;
  tokenOut: Address;
  amountInRaw: string;
  amountOutRaw?: string;
  priceImpactBps?: number;
  priceImpactSource?: RouteDiagnostics['priceImpactSource'];
  routeText?: string;
  pools?: RouteDiagnostics['pools'];
  routing?: string;
  protocols?: string[];
  gasEstimate?: string;
  gasFeeUSD?: string;
  approval?: RouteDiagnostics['approval'];
}): RouteDiagnostics {
  const amountOut = args.amountOutRaw;
  const amountOutMinimum = amountOut ? ((BigInt(amountOut) * BigInt(10_000 - input.slippageBps)) / 10_000n).toString() : undefined;
  return {
    source: args.source,
    routing: args.routing,
    protocols: args.protocols ?? [],
    chainId,
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amountIn: args.amountInRaw,
    amountOut,
    amountOutMinimum,
    slippageBps: input.slippageBps,
    priceImpactBps: args.priceImpactBps,
    priceImpactSource: args.priceImpactSource ?? 'unavailable',
    gasEstimate: args.gasEstimate,
    gasFeeUSD: args.gasFeeUSD,
    routeText: args.routeText ?? `${input.fromToken} → ${input.toToken}`,
    pools: args.pools ?? [],
    approval: args.approval,
    quoteValidUntil: quoteValidUntil()
  };
}

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

function tokenConfig(symbol: StablecoinSymbol): TokenConfig {
  const override = envAddress(`${symbol}_TOKEN_ADDRESS`) ?? envAddress(`${symbol}_TOKEN_ADDRESS_${chainId}`);
  const chainDefault = chainTokens[chainId]?.[symbol] ?? chainTokens[8453]?.[symbol] ?? {
    symbol,
    address: defaultTokenAddress,
    decimals: symbol === 'CELO' || symbol === 'CUSD' || symbol === 'CEUR' ? 18 : 6
  };
  return { ...chainDefault, address: override ?? chainDefault.address };
}

function supportedTokens() {
  return tokenSchema.options.map((symbol) => tokenConfig(symbol));
}

function orderedCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function v4QuoterAddress() {
  return envAddress(`V4_QUOTER_${chainId}`) ?? envAddress('V4_QUOTER');
}

async function buildV4PoolFallbackQuote(input: z.infer<typeof quoteSchema>, details?: { reason?: string; apiAttempted?: boolean; apiStatus?: number; apiError?: string }): Promise<CounterAgentQuote | undefined> {
  const quoter = v4QuoterAddress();
  if (!quoter || input.fromToken === input.toToken) return undefined;

  const fromToken = tokenConfig(input.fromToken);
  const toToken = tokenConfig(input.toToken);
  const amountInRaw = parseUnits(input.amount.replace(/,/g, ''), fromToken.decimals);
  const fee = Number(process.env.V4_POOL_FEE ?? 500);
  const tickSpacing = Number(process.env.V4_TICK_SPACING ?? 10);
  const hooks = (envAddress(`V4_HOOKS_${chainId}`) ?? envAddress('V4_HOOKS') ?? '0x0000000000000000000000000000000000000000') as Address;
  const [currency0, currency1] = orderedCurrencies(fromToken.address, toToken.address);
  const zeroForOne = fromToken.address.toLowerCase() === currency0.toLowerCase();

  try {
    const result = await publicClient.simulateContract({
      address: quoter,
      abi: v4QuoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{ poolKey: { currency0, currency1, fee, tickSpacing, hooks }, zeroForOne, exactAmount: amountInRaw, hookData: '0x' }]
    });

    const [amountOutRaw] = result.result;
    const amountInHuman = amountToNumber(input.amount);
    const amountOutHuman = Number(formatUnits(amountOutRaw, toToken.decimals));
    const rate = amountInHuman > 0 ? amountOutHuman / amountInHuman : 0;
    const quoteId = createHash('sha256')
      .update(JSON.stringify({ input, chainId, quoter, fee, tickSpacing, hooks, amountOutRaw: amountOutRaw.toString() }))
      .digest('hex')
      .slice(0, 24);

    return {
      quoteId,
      provider: 'uniswap-v4-pool-fallback',
      route: [input.fromToken, `Uniswap v4 ${fee}`, input.toToken],
      tokenIn: fromToken.address,
      tokenOut: toToken.address,
      amountIn: input.amount,
      amountInRaw: amountInRaw.toString(),
      estimatedAmountOut: amountOutHuman.toFixed(toToken.decimals),
      estimatedAmountOutRaw: amountOutRaw.toString(),
      rate,
      baselineRate: input.baselineRate ?? 1,
      feeBps: fee === 500 ? 5 : Math.round(fee / 100),
      priceImpactBps: 0,
      slippageBps: input.slippageBps,
      executable: executionMode === 'vault-live' && executorConfigured && Boolean(universalRouterAddress),
      dryRun: executionMode !== 'vault-live',
      fallbackReason: details?.reason ?? 'base_sepolia_uniswap_v4_pool_quote',
      apiAttempted: Boolean(details?.apiAttempted),
      apiStatus: details?.apiStatus,
      apiError: details?.apiError,
      routeDiagnostics: routeDiagnosticsFor(input, {
        source: 'v4-direct',
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountInRaw: amountInRaw.toString(),
        amountOutRaw: amountOutRaw.toString(),
        priceImpactBps: 0,
        priceImpactSource: 'unavailable',
        routing: 'DIRECT_POOL',
        protocols: ['V4'],
        routeText: `${input.fromToken} → Uniswap v4 ${fee} → ${input.toToken}`,
        pools: [{ fee, protocol: 'v4', tokenIn: input.fromToken, tokenOut: input.toToken }]
      }),
      rawQuote: { quoter, poolKey: { currency0, currency1, fee, tickSpacing, hooks }, zeroForOne, amountOutRaw: amountOutRaw.toString() }
    };
  } catch (error) {
    app.log.warn({ error, chainId, quoter, fee, tickSpacing }, 'Uniswap v4 pool fallback quote failed');
    return undefined;
  }
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
    apiError: details?.apiError,
    routeDiagnostics: routeDiagnosticsFor(input, {
      source: details?.apiAttempted ? 'dry-run' : 'oracle-fallback',
      tokenIn: fromToken.address,
      tokenOut: toToken.address,
      amountInRaw,
      amountOutRaw: estimatedAmountOutRaw,
      priceImpactBps,
      priceImpactSource: 'unavailable',
      routing: details?.apiAttempted ? 'API_FALLBACK' : 'ORACLE_ONLY',
      protocols: [],
      routeText: `${input.fromToken} → ${input.toToken}`
    })
  };
}

async function buildQuote(input: z.infer<typeof quoteSchema>): Promise<CounterAgentQuote> {
  if (!uniswapApiKeyConfigured || quoteMode === 'fallback-only') {
    const fallbackDetails = {
      reason: uniswapApiKeyConfigured ? 'fallback_only_mode' : 'uniswap_api_key_not_configured',
      apiAttempted: false
    };

    const v4Quote = await buildV4PoolFallbackQuote(input, fallbackDetails);
    if (v4Quote) return v4Quote;

    return buildFallbackQuote(input, fallbackDetails);
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
    const fallbackDetails = {
      reason: apiError?.status === 404 ? `uniswap_trading_api_unsupported_or_no_route_chain_${chainId}` : 'uniswap_trading_api_quote_failed',
      apiAttempted: true,
      apiStatus: apiError?.status,
      apiError: error instanceof Error ? error.message : 'uniswap_unknown_error'
    };

    app.log.warn({ error, chainId }, 'Uniswap Trading API quote failed; trying direct v4 pool fallback');
    const v4Quote = await buildV4PoolFallbackQuote(input, fallbackDetails);
    if (v4Quote) return v4Quote;

    app.log.warn({ chainId }, 'Uniswap v4 pool fallback unavailable; falling back to CounterAgent oracle quote');
    return buildFallbackQuote(input, fallbackDetails);
  }
}

async function attachApprovalDiagnostics(input: z.infer<typeof quoteSchema>, quote: CounterAgentQuote): Promise<CounterAgentQuote> {
  if (!uniswapApiKeyConfigured || quote.provider !== 'uniswap-trading-api') {
    quote.routeDiagnostics.approval = { required: false, calldataReady: false, source: quote.provider };
    return quote;
  }

  try {
    const approval = await uniswap.checkApproval({
      walletAddress: input.merchantWallet as Address,
      token: quote.tokenIn,
      amountRaw: quote.amountInRaw,
      chainId
    }) as { approval?: { to?: string; data?: string } | null; cancel?: unknown };
    quote.routeDiagnostics.approval = {
      required: Boolean(approval.approval),
      target: approval.approval?.to,
      calldataReady: Boolean(approval.approval?.data),
      source: 'uniswap-check-approval'
    };
  } catch (error) {
    quote.routeDiagnostics.approval = {
      required: false,
      calldataReady: false,
      source: 'uniswap-check-approval',
      error: error instanceof Error ? error.message : 'approval_check_failed'
    };
  }

  return quote;
}

function routeScore(quote: CounterAgentQuote) {
  const output = Number(quote.estimatedAmountOut);
  const gasUsd = Number(quote.routeDiagnostics.gasFeeUSD ?? 0);
  const impact = quote.priceImpactBps ?? 0;
  const sourceBonus = quote.provider === 'uniswap-trading-api' ? 1_000 : quote.provider.includes('v4') ? 400 : 0;
  return Math.round((Number.isFinite(output) ? output * 100 : 0) + sourceBonus - impact * 2 - (Number.isFinite(gasUsd) ? gasUsd * 10 : 0));
}

const previewPairsByChain: Record<number, [StablecoinSymbol, StablecoinSymbol][]> = {
  42220: [['CUSD', 'USDC'], ['CEUR', 'USDC'], ['USDC', 'USDT'], ['CELO', 'CUSD']],
  44787: [['CUSD', 'CEUR'], ['CELO', 'CUSD']],
  11142220: [['CUSD', 'USDC'], ['CEUR', 'USDC'], ['USDC', 'USDT'], ['CELO', 'CUSD']]
};

async function buildRoutePreview(input: z.infer<typeof quoteSchema>) {
  const pairs = previewPairsByChain[chainId] ?? [
    [input.fromToken, input.toToken],
    [input.fromToken, 'USDC'],
    [input.fromToken, 'EURC'],
    [input.fromToken, 'USDT']
  ];
  const uniquePairs = [...new Map(pairs.map(([from, to]) => [`${from}:${to}`, [from, to] as [StablecoinSymbol, StablecoinSymbol]])).values()]
    .filter(([from, to]) => from !== to && tokenConfig(from).address !== defaultTokenAddress && tokenConfig(to).address !== defaultTokenAddress);

  const routes = await Promise.all(uniquePairs.map(async ([fromToken, toToken]) => {
    try {
      const quote = await attachApprovalDiagnostics({ ...input, fromToken, toToken }, await buildQuote({ ...input, fromToken, toToken }));
      return {
        fromToken,
        toToken,
        ok: true,
        score: routeScore(quote),
        quoteId: quote.quoteId,
        provider: quote.provider,
        estimatedAmountOut: quote.estimatedAmountOut,
        rate: quote.rate,
        priceImpactBps: quote.priceImpactBps,
        fallbackReason: quote.fallbackReason,
        routeDiagnostics: quote.routeDiagnostics
      };
    } catch (error) {
      return { fromToken, toToken, ok: false, score: -1_000_000, error: error instanceof Error ? error.message : 'route_preview_failed' };
    }
  }));

  return {
    ok: true,
    chainId,
    workflowId: input.workflowId,
    routes: routes.sort((a, b) => b.score - a.score),
    recommendation: routes.find((route) => route.ok)?.score && routes.find((route) => route.ok && route.score > 0)
      ? 'convert-best-route'
      : 'hold-no-positive-route'
  };
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
    v4PoolFallbackConfigured: Boolean(v4QuoterAddress()),
    v4Quoter: v4QuoterAddress(),
    treasuryVaultFactoryConfigured: Boolean(treasuryVaultFactoryAddress),
    treasuryVaultFactoryAddress,
    universalRouterConfigured: Boolean(universalRouterAddress),
    universalRouterAddress,
    permit2Address,
    supportedTokens: supportedTokens().filter((token) => token.address !== defaultTokenAddress),
    keeperHubConfigured,
    executorConfigured
  },
  mcp: {
    service: 'counteragent-execution',
    tools: ['get_quote', 'execute_swap']
  }
}));

app.get('/execution/tokens', async () => ({
  ok: true,
  chainId,
  tokens: supportedTokens().map((token) => ({
    ...token,
    configured: token.address !== defaultTokenAddress
  }))
}));

async function buildQuoteResponse(input: z.infer<typeof quoteSchema>) {
  const quote = await attachApprovalDiagnostics(input, await buildQuote(input));
  pushRecentSwap({
    agent: 'A3',
    type: 'quote',
    workflowId: input.workflowId,
    merchant: input.merchantWallet,
    fromToken: input.fromToken,
    toToken: input.toToken,
    amount: input.amount,
    rate: quote.rate,
    status: quote.provider === 'uniswap-trading-api' ? 'quoted' : 'fallback-quote',
    quoteId: quote.quoteId,
    estimatedAmountOut: quote.estimatedAmountOut,
    provider: quote.provider,
    fallbackReason: quote.fallbackReason,
    timestamp: new Date().toISOString()
  });
  return { ok: true, workflowId: input.workflowId, quote };
}

async function resolveMerchantVault(input: { merchantWallet: string; vaultAddress?: string }) {
  if (input.vaultAddress && isAddress(input.vaultAddress)) {
    return {
      vaultAddress: input.vaultAddress as Address,
      deployed: true,
      source: 'request' as const
    };
  }

  if (!treasuryVaultFactoryAddress) {
    return {
      vaultAddress: null,
      predictedVault: null,
      deployed: false,
      source: 'not-configured' as const,
      error: 'treasury_vault_factory_not_configured'
    };
  }

  const merchant = input.merchantWallet as Address;
  const zeroAddress = '0x0000000000000000000000000000000000000000' as const;
  const [vaultOf, predictedVault] = await Promise.all([
    publicClient.readContract({
      address: treasuryVaultFactoryAddress,
      abi: treasuryVaultFactoryAbi,
      functionName: 'vaultOf',
      args: [merchant]
    }),
    publicClient.readContract({
      address: treasuryVaultFactoryAddress,
      abi: treasuryVaultFactoryAbi,
      functionName: 'predictedVault',
      args: [merchant]
    })
  ]);

  const deployed = vaultOf !== zeroAddress;
  return {
    vaultAddress: deployed ? vaultOf : predictedVault,
    predictedVault,
    deployed,
    source: deployed ? 'factory-vaultOf' as const : 'factory-predictedVault' as const
  };
}

function minAmountOutFor(quote: CounterAgentQuote) {
  const expected = BigInt(quote.estimatedAmountOutRaw);
  return (expected * BigInt(10_000 - quote.slippageBps)) / 10_000n;
}

const v4SwapExactInSingleParam = [{
  type: 'tuple',
  components: [
    {
      name: 'poolKey',
      type: 'tuple',
      components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' }
      ]
    },
    { name: 'zeroForOne', type: 'bool' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
    { name: 'hookData', type: 'bytes' }
  ]
}] as const;

const v4SettleAllParams = [
  { name: 'currency', type: 'address' },
  { name: 'maxAmount', type: 'uint256' }
] as const;

const v4TakeAllParams = [
  { name: 'currency', type: 'address' },
  { name: 'minAmount', type: 'uint256' }
] as const;

function buildV4UniversalRouterCalldata(quote: CounterAgentQuote, vaultAddress: Address, minAmountOut: bigint) {
  if (quote.provider !== 'uniswap-v4-pool-fallback') return undefined;
  const raw = quote.rawQuote as { poolKey?: { currency0?: Address; currency1?: Address; fee?: number; tickSpacing?: number; hooks?: Address }; zeroForOne?: boolean } | undefined;
  if (!raw?.poolKey || typeof raw.zeroForOne !== 'boolean') return undefined;
  const poolKey = raw.poolKey;
  if (!poolKey.currency0 || !poolKey.currency1 || poolKey.fee === undefined || poolKey.tickSpacing === undefined || !poolKey.hooks) return undefined;

  // Universal Router v4 command 0x10 executes an action plan. For exact-in we:
  // 1) swap the exact input through the known v4 pool,
  // 2) settle the input token through Permit2 from msg.sender (the vault),
  // 3) take all output back to msg.sender (the vault).
  const swapParam = encodeAbiParameters(v4SwapExactInSingleParam, [{
    poolKey: {
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      fee: poolKey.fee,
      tickSpacing: poolKey.tickSpacing,
      hooks: poolKey.hooks
    },
    zeroForOne: raw.zeroForOne,
    amountIn: BigInt(quote.amountInRaw),
    amountOutMinimum: minAmountOut,
    hookData: '0x'
  }]);
  const settleAllParam = encodeAbiParameters(v4SettleAllParams, [quote.tokenIn, BigInt(quote.amountInRaw)]);
  const takeAllParam = encodeAbiParameters(v4TakeAllParams, [quote.tokenOut, minAmountOut]);
  const v4Plan = encodeAbiParameters([
    { name: 'actions', type: 'bytes' },
    { name: 'params', type: 'bytes[]' }
  ], ['0x060c0f', [swapParam, settleAllParam, takeAllParam]]);
  const deadlineSeconds = BigInt(Math.floor(Date.now() / 1000) + Number(process.env.V4_SWAP_DEADLINE_SECONDS ?? 600));

  return {
    target: universalRouterAddress,
    calldata: encodeFunctionData({
      abi: universalRouterAbi,
      functionName: 'execute',
      args: ['0x10', [v4Plan], deadlineSeconds]
    }),
    source: 'uniswap-v4-universal-router' as const,
    spender: permit2Address as Address,
    swapper: vaultAddress
  };
}

async function buildVaultRouterCall(input: z.infer<typeof executeSchema>, vaultAddress: Address, quote: CounterAgentQuote) {
  if (input.routerCalldata) {
    return {
      target: universalRouterAddress,
      calldata: input.routerCalldata as Hex,
      source: 'request-calldata' as const
    };
  }

  if (quote.provider !== 'uniswap-trading-api' || !quote.rawQuote) {
    const minAmountOut = minAmountOutFor(quote);
    const v4RouterCall = buildV4UniversalRouterCalldata(quote, vaultAddress, minAmountOut);
    if (v4RouterCall?.target && v4RouterCall.calldata) return v4RouterCall;

    return {
      target: universalRouterAddress,
      calldata: undefined,
      source: 'unavailable' as const,
      error: 'uniswap_router_calldata_unavailable'
    };
  }

  const swap = await uniswap.buildSwap({ quote: quote.rawQuote });
  const tx = swap.transaction;
  const value = tx?.value ? BigInt(tx.value) : 0n;
  if (value > 0n) {
    return {
      target: tx?.to ?? universalRouterAddress,
      calldata: tx?.data,
      source: 'uniswap-trading-api' as const,
      error: 'native_value_router_calls_not_supported'
    };
  }

  return {
    target: tx?.to ?? universalRouterAddress,
    calldata: tx?.data,
    source: 'uniswap-trading-api' as const,
    requestId: swap.requestId,
    swapper: vaultAddress
  };
}

async function executeViaVault(input: z.infer<typeof executeSchema>) {
  const vault = await resolveMerchantVault(input);
  const vaultAddress = vault.vaultAddress;
  if (!vaultAddress) {
    return { ok: false, error: vault.error ?? 'vault_not_resolved', vault };
  }

  const quote = await attachApprovalDiagnostics({ ...input, merchantWallet: vaultAddress }, await buildQuote({ ...input, merchantWallet: vaultAddress }));
  const routerCall = await buildVaultRouterCall(input, vaultAddress, quote);
  const routerCallError = 'error' in routerCall ? routerCall.error : undefined;
  const expectedAmountOut = BigInt(quote.estimatedAmountOutRaw);
  const minAmountOut = minAmountOutFor(quote);
  const dryRunPayload = {
    ok: true,
    workflowId: input.workflowId,
    status: 'vault-dry-run',
    vault,
    quote,
    routerCall: {
      target: routerCall.target,
      source: routerCall.source,
      calldataReady: Boolean(routerCall.calldata),
      error: routerCallError
    },
    executeCall: {
      target: routerCall.target,
      inputToken: quote.tokenIn,
      outputToken: quote.tokenOut,
      amountIn: quote.amountInRaw,
      minAmountOut: minAmountOut.toString(),
      expectedAmountOut: expectedAmountOut.toString(),
      slippageBps: quote.slippageBps
    },
    transactionHash: null
  };

  if (executionMode !== 'vault-live') return dryRunPayload;

  if (!vault.deployed) return { ok: false, error: 'vault_not_deployed', vault };
  if (!executorConfigured || !process.env.EXECUTOR_PRIVATE_KEY) return { ok: false, error: 'executor_not_configured', vault };
  if (!routerCall.target || !routerCall.calldata) return { ok: false, error: routerCallError ?? 'router_calldata_not_ready', vault, quote };

  const account = privateKeyToAccount(process.env.EXECUTOR_PRIVATE_KEY as Hex);
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: publicClient.chain
  });

  let approvalTransactionHash: Hex | null = null;
  if (routerCall.source === 'uniswap-v4-universal-router') {
    const tokenApprovalTargetAllowed = await publicClient.readContract({
      address: vaultAddress,
      abi: treasuryVaultAbi,
      functionName: 'allowedTarget',
      args: [quote.tokenIn]
    });
    const permit2TargetAllowed = await publicClient.readContract({
      address: vaultAddress,
      abi: treasuryVaultAbi,
      functionName: 'allowedTarget',
      args: [permit2Address as Address]
    });
    if (!tokenApprovalTargetAllowed || !permit2TargetAllowed) {
      return {
        ok: false,
        error: !tokenApprovalTargetAllowed ? 'vault_token_approval_target_not_allowed' : 'vault_permit2_target_not_allowed',
        vault,
        quote,
        requiredTarget: !tokenApprovalTargetAllowed ? quote.tokenIn : permit2Address,
        message: 'The vault must allow the input token and Permit2 as temporary targets so A3 can prepare the Base Sepolia Uniswap v4 swap.'
      };
    }

    const permit2Allowance = await publicClient.readContract({
      address: quote.tokenIn,
      abi: erc20AllowanceAbi,
      functionName: 'allowance',
      args: [vaultAddress, permit2Address as Address]
    });
    if (permit2Allowance < BigInt(quote.amountInRaw)) {
      const approvePermit2Calldata = encodeFunctionData({
        abi: erc20AllowanceAbi,
        functionName: 'approve',
        args: [permit2Address as Address, BigInt(quote.amountInRaw)]
      });
      approvalTransactionHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: treasuryVaultAbi,
        functionName: 'executeCall',
        args: [
          quote.tokenIn,
          quote.tokenIn,
          quote.tokenOut,
          BigInt(quote.amountInRaw),
          0n,
          0n,
          quote.slippageBps,
          approvePermit2Calldata
        ]
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalTransactionHash });
    }

    const [permit2RouterAllowance] = await publicClient.readContract({
      address: permit2Address as Address,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [vaultAddress, quote.tokenIn, routerCall.target]
    });
    if (permit2RouterAllowance < BigInt(quote.amountInRaw)) {
      const expiration = Number(process.env.PERMIT2_ALLOWANCE_EXPIRATION ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const approveRouterCalldata = encodeFunctionData({
        abi: permit2Abi,
        functionName: 'approve',
        args: [quote.tokenIn, routerCall.target, BigInt(quote.amountInRaw), expiration]
      });
      const permit2ApprovalHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: treasuryVaultAbi,
        functionName: 'executeCall',
        args: [
          permit2Address as Address,
          quote.tokenIn,
          quote.tokenOut,
          BigInt(quote.amountInRaw),
          0n,
          0n,
          quote.slippageBps,
          approveRouterCalldata
        ]
      });
      await publicClient.waitForTransactionReceipt({ hash: permit2ApprovalHash });
      approvalTransactionHash = permit2ApprovalHash;
    }
  }

  const transactionHash = await walletClient.writeContract({
    address: vaultAddress,
    abi: treasuryVaultAbi,
    functionName: 'executeCall',
    args: [
      routerCall.target,
      quote.tokenIn,
      quote.tokenOut,
      BigInt(quote.amountInRaw),
      minAmountOut,
      expectedAmountOut,
      quote.slippageBps,
      routerCall.calldata
    ]
  });

  return {
    ...dryRunPayload,
    status: 'vault-swapped',
    executor: account.address,
    approvalTransactionHash,
    transactionHash
  };
}

async function buildExecuteResponse(input: z.infer<typeof executeSchema>) {
  if (input.decision.action !== 'CONVERT') {
    pushRecentSwap({
      agent: 'A3',
      type: 'execution',
      workflowId: input.workflowId,
      merchant: input.merchantWallet,
      fromToken: input.fromToken,
      toToken: input.toToken,
      amount: input.amount,
      status: 'skipped',
      txHash: null,
      timestamp: new Date().toISOString()
    });
    return {
      ok: true,
      workflowId: input.workflowId,
      status: 'skipped',
      reason: 'decision_was_hold',
      transactionHash: null
    };
  }

  const quote = await attachApprovalDiagnostics(input, await buildQuote(input));

  if (executionMode === 'vault-dry-run' || executionMode === 'vault-live') {
    const result = await executeViaVault(input) as {
      ok: boolean;
      status?: string;
      error?: string;
      transactionHash?: string | null;
      quote?: CounterAgentQuote;
    };
    pushRecentSwap({
      agent: 'A3',
      type: 'execution',
      workflowId: input.workflowId,
      merchant: input.merchantWallet,
      fromToken: input.fromToken,
      toToken: input.toToken,
      amount: input.amount,
      rate: result.ok ? result.quote?.rate : quote.rate,
      status: result.ok ? result.status ?? 'vault-dry-run' : result.error ?? 'vault_execution_failed',
      quoteId: result.ok ? result.quote?.quoteId : quote.quoteId,
      txHash: result.ok ? result.transactionHash ?? null : null,
      estimatedAmountOut: result.ok ? result.quote?.estimatedAmountOut : quote.estimatedAmountOut,
      provider: result.ok ? result.quote?.provider : quote.provider,
      fallbackReason: result.ok ? result.quote?.fallbackReason : quote.fallbackReason,
      timestamp: new Date().toISOString()
    });
    return result;
  }

  if (executionMode === 'dry-run' || quote.provider !== 'uniswap-trading-api') {
    const executionId = input.idempotencyKey ?? randomUUID();
    pushRecentSwap({
      agent: 'A3',
      type: 'execution',
      workflowId: input.workflowId,
      merchant: input.merchantWallet,
      fromToken: input.fromToken,
      toToken: input.toToken,
      amount: input.amount,
      rate: quote.rate,
      status: quote.provider === 'uniswap-trading-api' ? 'dry-run' : 'fallback-dry-run',
      quoteId: quote.quoteId,
      txHash: null,
      estimatedAmountOut: quote.estimatedAmountOut,
      provider: quote.provider,
      fallbackReason: quote.fallbackReason,
      timestamp: new Date().toISOString()
    });
    return {
      ok: true,
      workflowId: input.workflowId,
      status: quote.provider === 'uniswap-trading-api' ? 'dry-run' : 'fallback-dry-run',
      executionId,
      quote,
      transactionHash: null,
      message: quote.provider === 'uniswap-trading-api'
        ? 'Uniswap Trading API quote obtained; dry-run mode did not submit a transaction.'
        : 'Uniswap Trading API was unavailable for this route/chain; fallback quote used and no transaction was submitted.'
    };
  }

  if (!executorConfigured) {
    return { ok: false, error: 'executor_not_configured' };
  }

  return {
    ok: false,
    error: 'server_side_live_execution_not_enabled',
    message: 'Use /execution/swap to build Uniswap Trading API transaction calldata for browser wallet signing; server-side custody remains intentionally disabled.'
  };
}

app.post('/execution/quote', async (request, reply) => {
  const parsed = quoteSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  return reply.send(await buildQuoteResponse(parsed.data));
});

app.post('/execution/routes/preview', async (request, reply) => {
  const parsed = quoteSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  return reply.send(await buildRoutePreview(parsed.data));
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

  const result = await buildExecuteResponse(parsed.data) as { ok?: boolean; error?: string };
  if (result.ok === false && result.error === 'executor_not_configured') return reply.code(409).send(result);
  if (result.ok === false) return reply.code(501).send(result);
  return reply.send(result);
});

app.post('/mcp', async (request, reply) => {
  const parsed = jsonRpcSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid_request' } });
  }

  if (parsed.data.method === 'tools/list') {
    return reply.send({
      jsonrpc: '2.0',
      id: parsed.data.id,
      result: {
        tools: [
          { name: 'get_quote', description: 'Get a treasury swap quote.' },
          { name: 'execute_swap', description: 'Execute or dry-run a treasury swap decision.' }
        ]
      }
    });
  }

  if (parsed.data.method !== 'tools/call') {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32601, message: 'method_not_found' } });
  }

  const name = typeof parsed.data.params.name === 'string' ? parsed.data.params.name : '';
  const args = parsed.data.params.arguments ?? {};
  const schema = name === 'get_quote' ? quoteSchema : name === 'execute_swap' ? executeSchema : null;
  if (!schema) {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32601, message: 'tool_not_found' } });
  }

  const toolInput = schema.safeParse(args);
  if (!toolInput.success) {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32602, message: 'invalid_tool_arguments' } });
  }

  const result = name === 'get_quote'
    ? await buildQuoteResponse(toolInput.data as z.infer<typeof quoteSchema>)
    : await buildExecuteResponse(toolInput.data as z.infer<typeof executeSchema>);

  return reply.send({
    jsonrpc: '2.0',
    id: parsed.data.id,
    result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
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
