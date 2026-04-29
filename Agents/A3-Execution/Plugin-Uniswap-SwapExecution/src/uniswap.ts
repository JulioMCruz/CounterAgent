import { formatUnits, parseUnits, type Address } from 'viem';

export type StablecoinSymbol = 'USDC' | 'EURC' | 'USDT';

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
  estimatedAmountOut: string;
  rate: number;
  feeBps: number;
  priceImpactBps: number;
  slippageBps: number;
  gasFeeWei?: string;
  gasFeeUsd?: string;
  rawQuote: unknown;
};

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
            'content-type': 'application/json',
            ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {})
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const text = await response.text();

        if (!response.ok) {
          lastError = new Error(`uniswap_${path}_failed_${response.status}: ${text.slice(0, 240)}`);
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
      urgency: 'normal'
    });

    const quote = data.quote ?? data;
    const outputRaw = BigInt(quote?.output?.amount ?? 0);
    const inputRaw = BigInt(quote?.input?.amount ?? amountRaw);
    const outputHuman = Number(formatUnits(outputRaw, input.toToken.decimals));
    const inputHuman = Number(formatUnits(inputRaw, input.fromToken.decimals));
    const rate = inputHuman > 0 ? outputHuman / inputHuman : 0;

    return {
      quoteId: String(quote?.quoteId ?? data.requestId ?? `${Date.now()}`),
      provider: 'uniswap-trading-api',
      route: typeof quote?.routeString === 'string' ? [quote.routeString] : [input.fromToken.symbol, input.toToken.symbol],
      tokenIn: input.fromToken.address,
      tokenOut: input.toToken.address,
      amountIn: input.amount,
      estimatedAmountOut: outputHuman.toFixed(6),
      rate,
      feeBps: 0,
      priceImpactBps: Number(quote?.priceImpactBps ?? 0),
      slippageBps: input.slippageBps,
      gasFeeWei: quote?.gasFee ?? data.gasFee,
      gasFeeUsd: quote?.gasFeeUSD ?? data.gasFeeUSD,
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

  async buildSwap(input: { quote: unknown; permitData?: unknown; signature?: `0x${string}` }) {
    const body: Record<string, unknown> = {
      quote: input.quote,
      simulateTransaction: true
    };

    if (input.permitData) body.permitData = input.permitData;
    if (input.signature && input.signature !== '0x') body.signature = input.signature;

    return this.post('/swap', body);
  }
}
