import { formatUnits, parseUnits, type Address } from 'viem';

export type StablecoinSymbol = 'USDC' | 'EURC' | 'USDT' | 'CUSD' | 'CEUR' | 'CELO';

export type TokenConfig = {
  symbol: StablecoinSymbol;
  address: Address;
  decimals: number;
};

export type CounterAgentQuoteInput = {
  merchantWallet: Address;
  chainId: number;
  fromToken: TokenConfig;
  toToken: TokenConfig;
  amount: string;
  slippageBps: number;
};

export type NormalizedUniswapQuote = {
  quoteId: string;
  provider: 'uniswap-trading-api';
  route: string[];
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountInRaw: string;
  estimatedAmountOut: string;
  estimatedAmountOutRaw: string;
  rate: number;
  feeBps: number;
  priceImpactBps: number;
  slippageBps: number;
  gasFeeWei?: string;
  gasFeeUsd?: string;
  routeDiagnostics: RouteDiagnostics;
  rawQuote: unknown;
};

export type RouteDiagnostics = {
  source: 'trading-api' | 'v4-direct' | 'oracle-fallback' | 'dry-run';
  routing?: string;
  protocols: string[];
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountOut?: string;
  amountOutMinimum?: string;
  slippageBps: number;
  priceImpactBps?: number;
  priceImpactSource: 'api' | 'pool-slot0' | 'twap' | 'unavailable';
  gasEstimate?: string;
  gasFeeUSD?: string;
  routeText: string;
  pools: Array<{ address?: string; fee?: number; protocol?: 'v2' | 'v3' | 'v4'; tokenIn?: string; tokenOut?: string }>;
  approval?: { required: boolean; target?: string; calldataReady?: boolean; source?: string; error?: string };
  quoteValidUntil?: string;
};

export type NormalizedUniswapSwap = {
  provider: 'uniswap-trading-api';
  status: 'swap-built';
  requestId?: string;
  transaction?: {
    to?: Address;
    from?: Address;
    data?: `0x${string}`;
    value?: string;
    gasLimit?: string;
    chainId?: number;
  };
  rawSwap: unknown;
};

export class UniswapApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
    readonly path?: string
  ) {
    super(message);
    this.name = 'UniswapApiError';
  }
}

export class UniswapTradingApiClient {
  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey?: string;
      retryCount: number;
      timeoutMs: number;
    }
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-universal-router-version': '2.0',
            ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {})
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const text = await response.text();

        if (!response.ok) {
          lastError = new UniswapApiError(
            `uniswap_${path.replace('/', '')}_failed_${response.status}: ${text.slice(0, 240)}`,
            response.status,
            text.slice(0, 1_000),
            path
          );
          if (response.status >= 500 || response.status === 404 || response.status === 429) continue;
          throw lastError;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error;
        if (attempt === this.config.retryCount) break;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('uniswap_request_failed');
  }

  private routeHops(route: unknown): any[] {
    if (!Array.isArray(route)) return [];
    return route.flatMap((entry) => Array.isArray(entry) ? entry : [entry]).filter((entry) => entry && typeof entry === 'object');
  }

  private routeText(route: unknown, fallback: string[]) {
    const hops = this.routeHops(route);
    if (hops.length === 0) return fallback.join(' → ');
    const symbols = hops.map((hop) => hop?.tokenIn?.symbol ?? hop?.input?.symbol ?? hop?.tokenInSymbol).filter(Boolean);
    const last = hops.at(-1)?.tokenOut?.symbol ?? hops.at(-1)?.output?.symbol ?? hops.at(-1)?.tokenOutSymbol;
    if (last) symbols.push(last);
    return symbols.length > 0 ? [...new Set(symbols)].join(' → ') : fallback.join(' → ');
  }

  private routePools(route: unknown): RouteDiagnostics['pools'] {
    return this.routeHops(route).map((hop) => ({
      address: typeof hop?.address === 'string' ? hop.address : typeof hop?.poolAddress === 'string' ? hop.poolAddress : undefined,
      fee: typeof hop?.fee === 'number' ? hop.fee : typeof hop?.feeAmount === 'number' ? hop.feeAmount : undefined,
      protocol: String(hop?.protocol ?? hop?.type ?? '').toLowerCase().includes('v4') ? 'v4'
        : String(hop?.protocol ?? hop?.type ?? '').toLowerCase().includes('v2') ? 'v2'
          : 'v3',
      tokenIn: hop?.tokenIn?.symbol ?? hop?.input?.symbol,
      tokenOut: hop?.tokenOut?.symbol ?? hop?.output?.symbol
    }));
  }

  async quote(input: CounterAgentQuoteInput): Promise<NormalizedUniswapQuote> {
    const amountRaw = parseUnits(input.amount.replace(/,/g, ''), input.fromToken.decimals).toString();
    const slippagePct = input.slippageBps / 100;

    const data = await this.post<Record<string, any>>('/quote', {
      type: 'EXACT_INPUT',
      amount: amountRaw,
      tokenIn: input.fromToken.address,
      tokenOut: input.toToken.address,
      tokenInChainId: input.chainId,
      tokenOutChainId: input.chainId,
      swapper: input.merchantWallet,
      slippageTolerance: slippagePct,
      generatePermitAsTransaction: false,
      routingPreference: 'CLASSIC',
      spreadOptimization: 'EXECUTION',
      urgency: 'normal',
      permitAmount: 'FULL',
      protocols: ['V4', 'V3']
    });

    const quote = data.quote ?? data;
    const outputRawValue = quote?.output?.amount ?? quote?.outputAmount ?? quote?.amountOut ?? '0';
    const inputRawValue = quote?.input?.amount ?? quote?.inputAmount ?? amountRaw;
    const outputRaw = BigInt(outputRawValue || 0);
    const inputRaw = BigInt(inputRawValue || amountRaw);
    const outputHuman = Number(formatUnits(outputRaw, input.toToken.decimals));
    const inputHuman = Number(formatUnits(inputRaw, input.fromToken.decimals));
    const rate = inputHuman > 0 ? outputHuman / inputHuman : 0;

    const routeText = this.routeText(quote?.route, [input.fromToken.symbol, input.toToken.symbol]);
    const quoteValidUntil = new Date(Date.now() + 20_000).toISOString();
    const priceImpactBps = Number(quote?.priceImpactBps ?? quote?.priceImpact?.bps ?? 0);

    return {
      quoteId: String(quote?.quoteId ?? data.requestId ?? `${Date.now()}`),
      provider: 'uniswap-trading-api',
      route: Array.isArray(quote?.route)
        ? quote.route.map((part: unknown) => (typeof part === 'string' ? part : JSON.stringify(part))).slice(0, 8)
        : typeof quote?.routeString === 'string'
          ? [quote.routeString]
          : [input.fromToken.symbol, input.toToken.symbol],
      tokenIn: input.fromToken.address,
      tokenOut: input.toToken.address,
      amountIn: input.amount,
      amountInRaw: inputRaw.toString(),
      estimatedAmountOut: outputHuman.toFixed(input.toToken.decimals),
      estimatedAmountOutRaw: outputRaw.toString(),
      rate,
      feeBps: Number(quote?.aggregatedOutputs?.[0]?.bps ?? quote?.feeBps ?? 0),
      priceImpactBps,
      slippageBps: input.slippageBps,
      gasFeeWei: quote?.gasFee ?? data.gasFee,
      gasFeeUsd: quote?.gasFeeUSD ?? data.gasFeeUSD,
      routeDiagnostics: {
        source: 'trading-api',
        routing: String(data.routing ?? quote?.routing ?? 'CLASSIC'),
        protocols: ['V4', 'V3'],
        chainId: input.chainId,
        tokenIn: input.fromToken.address,
        tokenOut: input.toToken.address,
        amountIn: inputRaw.toString(),
        amountOut: outputRaw.toString(),
        amountOutMinimum: ((outputRaw * BigInt(10_000 - input.slippageBps)) / 10_000n).toString(),
        slippageBps: input.slippageBps,
        priceImpactBps,
        priceImpactSource: Number.isFinite(priceImpactBps) && priceImpactBps > 0 ? 'api' : 'unavailable',
        gasEstimate: quote?.gasUseEstimate ?? quote?.gasEstimate,
        gasFeeUSD: quote?.gasFeeUSD ?? data.gasFeeUSD,
        routeText,
        pools: this.routePools(quote?.route),
        quoteValidUntil
      },
      rawQuote: quote
    };
  }

  async checkApproval(input: { walletAddress: Address; token: Address; amountRaw: string; chainId: number }) {
    return this.post('/check_approval', {
      walletAddress: input.walletAddress,
      token: input.token,
      amount: input.amountRaw,
      chainId: input.chainId,
      includeGasInfo: true
    });
  }

  async buildSwap(input: { quote: unknown; permitData?: unknown; signature?: `0x${string}` }): Promise<NormalizedUniswapSwap> {
    const body: Record<string, unknown> = {
      quote: input.quote,
      simulateTransaction: true
    };

    if (input.permitData) body.permitData = input.permitData;
    if (input.signature && input.signature !== '0x') body.signature = input.signature;

    const data = await this.post<Record<string, any>>('/swap', body);
    const rawTx = data.swap ?? data.transaction ?? data;
    const tx = rawTx?.transaction ?? rawTx;

    return {
      provider: 'uniswap-trading-api',
      status: 'swap-built',
      requestId: data.requestId ?? rawTx?.requestId,
      transaction: tx
        ? {
            to: tx.to,
            from: tx.from,
            data: tx.data,
            value: tx.value,
            gasLimit: tx.gasLimit ?? tx.gas,
            chainId: tx.chainId
          }
        : undefined,
      rawSwap: data
    };
  }
}
