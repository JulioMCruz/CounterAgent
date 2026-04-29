import cors from '@fastify/cors';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const messageSchema = z.object({
  workflowId: z.string().min(1).max(160),
  fromAgent: z.string().min(1).max(120),
  toAgent: z.string().min(1).max(120),
  messageType: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional()
});

const port = Number(process.env.PORT ?? 8792);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const axlMode = process.env.GENSYN_AXL_MODE ?? 'adapter';
const axlNodeUrl = process.env.GENSYN_AXL_NODE_URL;
const axlAgentId = process.env.GENSYN_AXL_AGENT_ID ?? 'counteragent-a0';

const app = Fastify({ logger: true });
const messages = new Map<string, unknown[]>();

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'gensyn-axl-agent-messaging',
  axl: {
    mode: axlMode,
    agentId: axlAgentId,
    nodeConfigured: Boolean(axlNodeUrl)
  }
}));

app.post('/axl/messages', async (request, reply) => {
  const parsed = messageSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  const message = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    transport: axlNodeUrl ? 'axl-node-pending' : 'local-adapter',
    ...parsed.data
  };

  const workflowMessages = messages.get(parsed.data.workflowId) ?? [];
  workflowMessages.push(message);
  messages.set(parsed.data.workflowId, workflowMessages);

  // TODO: forward to local Gensyn AXL node when node API details are configured.
  return reply.send({ ok: true, message });
});

app.get('/axl/messages/:workflowId', async (request) => {
  const { workflowId } = request.params as { workflowId: string };
  return {
    ok: true,
    workflowId,
    messages: messages.get(workflowId) ?? []
  };
});

await app.listen({ port, host: '0.0.0.0' });
