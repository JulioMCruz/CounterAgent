import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';

const alertKindSchema = z.enum(['swap_executed', 'hold', 'anomaly', 'halt']);

const sendSchema = z.object({
  chatId: z.string().min(1).max(120),
  kind: alertKindSchema.default('anomaly'),
  text: z.string().min(1).max(3500).optional(),
  merchantEns: z.string().max(255).optional(),
  merchantWallet: z.string().max(80).optional(),
  decision: z.string().max(80).optional(),
  amount: z.string().max(80).optional(),
  fromToken: z.string().max(20).optional(),
  toToken: z.string().max(20).optional(),
  txHash: z.string().max(100).optional(),
  reportId: z.string().max(120).optional(),
  storageUri: z.string().max(500).optional(),
  summary: z.string().max(1200).optional()
});

const port = Number(process.env.PORT ?? 8794);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragents.cc')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const alertsEnabled = process.env.TELEGRAM_ALERTS_ENABLED !== 'false';
const timeoutMs = Number(process.env.TELEGRAM_TIMEOUT_MS ?? 8000);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

function escapeMarkdown(value: string) {
  return value.replace(/[_*`\[]/g, (match) => `\\${match}`);
}

function isSupportedChatId(chatId: string) {
  const value = chatId.trim();
  return /^-?\d+$/.test(value) || /^@[a-zA-Z0-9_]{5,32}$/.test(value);
}

function isLikelyPrivateUsername(chatId: string) {
  return /^@[a-zA-Z0-9_]{5,32}$/.test(chatId.trim());
}

function template(input: z.infer<typeof sendSchema>) {
  if (input.text) return input.text;

  const merchant = input.merchantEns || input.merchantWallet || 'merchant';
  const pair = input.fromToken && input.toToken ? `${input.fromToken} → ${input.toToken}` : 'treasury workflow';
  const amount = input.amount ? ` for ${input.amount}` : '';
  const report = input.reportId ? `\nReport: ${input.reportId}` : '';
  const tx = input.txHash ? `\nTx: ${input.txHash}` : '';
  const summary = input.summary ? `\n${input.summary}` : '';

  if (input.kind === 'swap_executed') {
    return `✅ swap executed\n${merchant}\n${pair}${amount}${tx}${report}`;
  }
  if (input.kind === 'hold') {
    return `⏸ hold\n${merchant}\nNo conversion executed.${summary}${report}`;
  }
  if (input.kind === 'halt') {
    return `🛑 halt\n${merchant}\nExecution blocked by policy or safety checks.${summary}${report}`;
  }
  return `⚠️ anomaly\n${merchant}\n${input.decision || 'Workflow needs attention.'}${summary}${report}`;
}

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'telegram-alerts',
  enabled: alertsEnabled,
  botConfigured: Boolean(botToken && !botToken.includes('<'))
}));

app.post('/telegram/send', async (request, reply) => {
  const parsed = sendSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  if (!alertsEnabled) {
    return reply.send({ ok: true, skipped: true, reason: 'telegram_alerts_disabled' });
  }

  if (!botToken || botToken.includes('<')) {
    return reply.code(503).send({ ok: false, error: 'telegram_bot_not_configured' });
  }

  const chatId = parsed.data.chatId.trim();
  if (!isSupportedChatId(chatId)) {
    return reply.code(400).send({ ok: false, error: 'unsupported_chat_id', message: 'Use a numeric Telegram chat_id or a channel @username.' });
  }

  const text = escapeMarkdown(template(parsed.data));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.ok === false) {
      const description = typeof payload.description === 'string' ? payload.description : `telegram_${response.status}`;
      return reply.code(response.status >= 500 ? 502 : 400).send({
        ok: false,
        error: 'telegram_send_failed',
        description,
        hint: isLikelyPrivateUsername(chatId) ? 'Telegram bots cannot DM arbitrary usernames. Capture the numeric chat_id after the user starts the bot.' : undefined
      });
    }

    return reply.send({ ok: true, chatId, kind: parsed.data.kind, messageId: payload.result?.message_id });
  } catch (error) {
    request.log.warn({ error }, 'Telegram send failed');
    return reply.code(502).send({ ok: false, error: 'telegram_send_failed' });
  } finally {
    clearTimeout(timer);
  }
});

await app.listen({ port, host: '0.0.0.0' });
