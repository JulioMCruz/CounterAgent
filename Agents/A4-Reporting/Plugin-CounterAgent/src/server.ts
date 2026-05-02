import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { isAddress, type Hex } from 'viem';
import { z } from 'zod';

const txHashPattern = /^0x[a-fA-F0-9]{64}$/;

const reportSchema = z.object({
  reportId: z.string().min(4).max(120).optional(),
  merchantEns: z.string().min(1).max(255),
  merchantWallet: z.string().refine(isAddress, 'Invalid merchant wallet'),
  decision: z.string().min(1).max(80),
  summary: z.string().min(1).max(2_000),
  fxRate: z.string().max(80).optional(),
  transactionHash: z.string().regex(txHashPattern).optional(),
  savingsEstimateUsd: z.string().max(80).optional(),
  executionAgent: z.string().max(120).optional(),
  metadata: z.record(z.unknown()).optional()
});

const jsonRpcSchema = z.object({
  jsonrpc: z.string().optional(),
  id: z.unknown().optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional().default({})
});

const port = Number(process.env.PORT ?? 8789);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const storageMode = (process.env.REPORT_STORAGE_MODE ?? 'local').toLowerCase();
const storageDir = process.env.REPORT_STORAGE_DIR ?? './data/reports';
const zeroGChainId = Number(process.env.ZERO_G_CHAIN_ID ?? 16602);
const zeroGRpcUrl = process.env.ZERO_G_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const zeroGIndexerRpcUrl = process.env.ZERO_G_INDEXER_RPC_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const a4PrivateKey = process.env.A4_REPORTING_PRIVATE_KEY as Hex | undefined;
const a4PrivateKeyConfigured = Boolean(a4PrivateKey);
const telegramAlertsUrl = process.env.TELEGRAM_ALERTS_URL?.replace(/\/$/, '');
const telegramAlertsEnabled = process.env.TELEGRAM_ALERTS_ENABLED !== 'false';

const app = Fastify({ logger: true });

type RecentReport = {
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

const recentReports = new Map<string, RecentReport[]>();
const recentLimit = Number(process.env.RECENT_EVENT_LIMIT ?? 20);
const merchantKey = (value: string) => value.toLowerCase();

function pushRecentReport(event: RecentReport) {
  const key = merchantKey(event.merchant);
  const items = recentReports.get(key) ?? [];
  items.unshift(event);
  recentReports.set(key, items.slice(0, recentLimit));
}

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

type CanonicalReport = z.infer<typeof reportSchema> & {
  reportId: string;
  schemaVersion: 1;
  createdAt: string;
};

type TelegramAlertResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  messageId?: number;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const canonicalJson = (value: unknown) => `${stableStringify(value)}\n`;

const hashReport = (report: CanonicalReport) => `sha256:${createHash('sha256').update(canonicalJson(report)).digest('hex')}`;

const reportPath = (reportId: string) => path.join(storageDir, `${reportId}.json`);

async function publishLocal(report: CanonicalReport) {
  await mkdir(storageDir, { recursive: true });
  const contentHash = hashReport(report);
  await writeFile(reportPath(report.reportId), `${JSON.stringify({ ...report, contentHash }, null, 2)}\n`, 'utf8');
  return {
    backend: 'local',
    contentHash,
    storageUri: `local://${report.reportId}`
  };
}

async function publishZeroG(report: CanonicalReport) {
  if (!zeroGIndexerRpcUrl || !a4PrivateKey) {
    throw new Error('0G storage is not configured');
  }

  const payload = canonicalJson(report);
  const contentHash = `sha256:${createHash('sha256').update(payload).digest('hex')}`;
  const indexer = new Indexer(zeroGIndexerRpcUrl);
  const provider = new JsonRpcProvider(zeroGRpcUrl);
  const signer = new Wallet(a4PrivateKey, provider);
  const data = new MemData(Buffer.from(payload, 'utf8'));

  const [result, error] = await indexer.upload(data, zeroGRpcUrl, signer as never);

  if (error || !result) {
    throw error ?? new Error('0G upload failed');
  }

  const rootHash = 'rootHash' in result ? result.rootHash : result.rootHashes[0];
  const transactionHash = 'txHash' in result ? result.txHash : result.txHashes[0];

  return {
    backend: '0g',
    contentHash,
    storageUri: `0g://${rootHash}`,
    rootHash,
    transactionHash
  };
}

async function publishReport(report: CanonicalReport) {
  if (storageMode === '0g') {
    return publishZeroG(report);
  }
  return publishLocal(report);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFrom(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function alertKind(report: CanonicalReport): 'swap_executed' | 'hold' | 'anomaly' | 'halt' {
  const decision = report.decision.toLowerCase();
  const metadata = metadataRecord(report.metadata);
  const execution = metadataRecord(metadata.execution);
  const status = stringFrom(execution.status)?.toLowerCase() ?? '';

  if (decision.includes('hold')) return 'hold';
  if (decision.includes('halt') || decision.includes('blocked') || status.includes('blocked')) return 'halt';
  if (decision.includes('convert') || status.includes('executed') || status.includes('submitted') || status.includes('dry-run')) return 'swap_executed';
  return 'anomaly';
}

function telegramChatIdFrom(report: CanonicalReport) {
  const metadata = metadataRecord(report.metadata);
  const notification = metadataRecord(metadata.notification);
  const ens = metadataRecord(metadata.ens);
  const records = metadataRecord(ens.records);

  return stringFrom(notification.telegramChatId)
    ?? stringFrom(notification.telegram_chat_id)
    ?? stringFrom(metadata.telegramChatId)
    ?? stringFrom(records['counteragent.telegram_chat_id']);
}

async function sendTelegramAlert(report: CanonicalReport, published: Awaited<ReturnType<typeof publishReport>>): Promise<TelegramAlertResult> {
  if (!telegramAlertsEnabled) return { ok: true, skipped: true, reason: 'telegram_alerts_disabled' };
  if (!telegramAlertsUrl) return { ok: true, skipped: true, reason: 'telegram_alerts_not_configured' };

  const chatId = telegramChatIdFrom(report);
  if (!chatId) return { ok: true, skipped: true, reason: 'telegram_chat_id_missing' };

  const metadata = metadataRecord(report.metadata);
  const execution = metadataRecord(metadata.execution);
  const quote = metadataRecord(metadata.quote);
  const quoteData = metadataRecord(quote.quote);

  try {
    const response = await fetch(`${telegramAlertsUrl}/telegram/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId,
        kind: alertKind(report),
        merchantEns: report.merchantEns,
        merchantWallet: report.merchantWallet,
        decision: report.decision,
        amount: stringFrom(metadata.amount) ?? stringFrom(quoteData.amountIn),
        fromToken: stringFrom(metadata.fromToken),
        toToken: stringFrom(metadata.toToken),
        txHash: report.transactionHash ?? stringFrom(execution.transactionHash),
        reportId: report.reportId,
        storageUri: published.storageUri,
        summary: report.summary
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      return { ok: false, error: typeof payload.error === 'string' ? payload.error : `telegram_alert_failed_${response.status}`, reason: payload.description };
    }
    return payload as TelegramAlertResult;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'telegram_alert_failed' };
  }
}

app.get('/report/recent', async (request, reply) => {
  const merchant = typeof (request.query as { merchant?: unknown }).merchant === 'string'
    ? (request.query as { merchant: string }).merchant
    : '';

  if (!isAddress(merchant)) {
    return reply.code(400).send({ ok: false, error: 'invalid_merchant' });
  }

  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? recentLimit), recentLimit);
  return reply.send({ ok: true, merchant, reports: (recentReports.get(merchantKey(merchant)) ?? []).slice(0, limit) });
});

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'reporting',
  mcp: {
    service: 'counteragent-reporting',
    tools: ['publish_report']
  },
  storageMode,
  zeroG: {
    chainId: zeroGChainId,
    rpcUrl: zeroGRpcUrl,
    indexerConfigured: Boolean(zeroGIndexerRpcUrl),
    indexerUrl: zeroGIndexerRpcUrl,
    signerConfigured: a4PrivateKeyConfigured
  },
  telegramAlerts: {
    enabled: telegramAlertsEnabled,
    configured: Boolean(telegramAlertsUrl)
  }
}));

async function buildAndPublishReport(data: z.infer<typeof reportSchema>) {
  const report: CanonicalReport = {
    ...data,
    reportId: data.reportId ?? randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString()
  };

  const published = await publishReport(report);
  const telegramAlert = await sendTelegramAlert(report, published);
  pushRecentReport({
    agent: 'A4',
    reportId: report.reportId,
    merchant: report.merchantWallet,
    merchantEns: report.merchantEns,
    decision: report.decision,
    summary: report.summary,
    storageUri: published.storageUri,
    contentHash: published.contentHash,
    txHash: 'transactionHash' in published && typeof published.transactionHash === 'string' ? published.transactionHash : report.transactionHash,
    savingsEstimateUsd: report.savingsEstimateUsd,
    timestamp: report.createdAt
  });

  return {
    ok: true,
    reportId: report.reportId,
    ...published,
    telegramAlert,
    telegramWarning: telegramAlert.ok ? undefined : telegramAlert.error ?? 'telegram_alert_failed'
  };
}

app.post('/reports/publish', async (request, reply) => {
  const parsed = reportSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  try {
    return reply.send(await buildAndPublishReport(parsed.data));
  } catch (error) {
    request.log.error({ error }, 'report publish failed');
    return reply.code(502).send({ ok: false, error: 'report_publish_failed' });
  }
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
        tools: [{ name: 'publish_report', description: 'Publish a CounterAgent workflow report and audit trail.' }]
      }
    });
  }

  if (parsed.data.method !== 'tools/call') {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32601, message: 'method_not_found' } });
  }

  const name = typeof parsed.data.params.name === 'string' ? parsed.data.params.name : '';
  if (name !== 'publish_report') {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32601, message: 'tool_not_found' } });
  }

  const args = reportSchema.safeParse(parsed.data.params.arguments ?? {});
  if (!args.success) {
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32602, message: 'invalid_tool_arguments' } });
  }

  try {
    const result = await buildAndPublishReport(args.data);
    return reply.send({
      jsonrpc: '2.0',
      id: parsed.data.id,
      result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
    });
  } catch (error) {
    request.log.error({ error }, 'A4 MCP report publish failed');
    return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32001, message: 'report_publish_failed' } });
  }
});

app.get('/reports/:id', async (request, reply) => {
  const { id } = request.params as { id: string };

  if (!/^[a-zA-Z0-9._:-]{4,120}$/.test(id)) {
    return reply.code(400).send({ ok: false, error: 'invalid_report_id' });
  }

  if (storageMode !== 'local') {
    return reply.code(501).send({ ok: false, error: 'report_read_not_supported_for_backend' });
  }

  try {
    const content = await readFile(reportPath(id), 'utf8');
    return reply.type('application/json').send(content);
  } catch {
    return reply.code(404).send({ ok: false, error: 'report_not_found' });
  }
});

await app.listen({ port, host: '0.0.0.0' });
