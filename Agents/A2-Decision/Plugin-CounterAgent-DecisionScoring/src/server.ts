import cors from '@fastify/cors';
import Fastify from 'fastify';
import { isAddress } from 'viem';
import { z } from 'zod';

const tokenSchema = z.enum(['USDC', 'EURC', 'USDT']);
const riskSchema = z.enum(['conservative', 'moderate', 'aggressive']).or(
  z.enum(['Conservative', 'Moderate', 'Aggressive']).transform((value) => value.toLowerCase() as 'conservative' | 'moderate' | 'aggressive')
);

const decisionSchema = z.object({
  workflowId: z.string().min(1).max(120).optional(),
  merchantEns: z.string().min(1).max(255).optional(),
  merchantWallet: z.string().refine(isAddress, 'Invalid merchant wallet'),
  fromToken: tokenSchema,
  toToken: tokenSchema.default('USDC'),
  amount: z.string().min(1).max(80),
  fxThresholdBps: z.number().int().min(0).max(10_000),
  riskTolerance: riskSchema.default('moderate'),
  quote: z.object({
    provider: z.string().min(1).max(80).optional(),
    rate: z.number().positive(),
    baselineRate: z.number().positive().optional(),
    feeBps: z.number().min(0).max(10_000).default(0),
    priceImpactBps: z.number().min(0).max(10_000).default(0),
    estimatedGasUsd: z.string().max(80).optional()
  }),
  metadata: z.record(z.unknown()).optional()
});

const port = Number(process.env.PORT ?? 8790);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const minConfidence = Number(process.env.DECISION_MIN_CONFIDENCE ?? 70);
const defaultBaselineRate = Number(process.env.DECISION_DEFAULT_BASELINE_RATE ?? 1);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

const riskBuffersBps: Record<'conservative' | 'moderate' | 'aggressive', number> = {
  conservative: 25,
  moderate: 10,
  aggressive: 0
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function evaluateDecision(input: z.infer<typeof decisionSchema>) {
  if (input.fromToken === input.toToken) {
    return {
      action: 'HOLD' as const,
      confidence: 100,
      spreadBps: 0,
      netScoreBps: 0,
      thresholdBps: input.fxThresholdBps,
      reason: 'Source and target stablecoin are the same; no conversion needed.'
    };
  }

  const baselineRate = input.quote.baselineRate ?? defaultBaselineRate;
  const spreadBps = ((input.quote.rate - baselineRate) / baselineRate) * 10_000;
  const riskBufferBps = riskBuffersBps[input.riskTolerance];
  const netScoreBps = spreadBps - input.quote.feeBps - input.quote.priceImpactBps - riskBufferBps;
  const convert = netScoreBps >= input.fxThresholdBps;
  const distanceFromThreshold = Math.abs(netScoreBps - input.fxThresholdBps);
  const confidence = clamp(Math.round(minConfidence + distanceFromThreshold / 4), minConfidence, 99);

  return {
    action: convert ? 'CONVERT' as const : 'HOLD' as const,
    confidence,
    spreadBps: Math.round(spreadBps),
    netScoreBps: Math.round(netScoreBps),
    thresholdBps: input.fxThresholdBps,
    riskBufferBps,
    reason: convert
      ? `Net opportunity ${Math.round(netScoreBps)} bps meets threshold ${input.fxThresholdBps} bps.`
      : `Net opportunity ${Math.round(netScoreBps)} bps is below threshold ${input.fxThresholdBps} bps.`
  };
}

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'decision',
  minConfidence
}));

app.post('/decision/evaluate', async (request, reply) => {
  const parsed = decisionSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const decision = evaluateDecision(parsed.data);

  return reply.send({
    ok: true,
    workflowId: parsed.data.workflowId,
    merchantEns: parsed.data.merchantEns,
    merchantWallet: parsed.data.merchantWallet,
    fromToken: parsed.data.fromToken,
    toToken: parsed.data.toToken,
    amount: parsed.data.amount,
    quote: parsed.data.quote,
    decision
  });
});

await app.listen({ port, host: '0.0.0.0' });
