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

const transportEnvelopeSchema = z.object({
  workflowId: z.string().min(1).max(160),
  messageId: z.string().min(1).max(160).optional(),
  sequence: z.number().int().nonnegative().optional(),
  fromAgent: z.string().min(1).max(120),
  toAgent: z.string().min(1).max(120),
  messageType: z.string().min(1).max(80),
  createdAt: z.string().optional(),
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
const mcpServiceUrls: Record<string, string | undefined> = {
  'counteragent-monitor': process.env.GENSYN_AXL_SERVICE_A1_URL ?? 'http://127.0.0.1:8788/mcp',
  'counteragent-decision': process.env.GENSYN_AXL_SERVICE_A2_URL ?? 'http://127.0.0.1:8790/mcp',
  'counteragent-execution': process.env.GENSYN_AXL_SERVICE_A3_URL ?? 'http://127.0.0.1:8791/mcp',
  'counteragent-reporting': process.env.GENSYN_AXL_SERVICE_A4_URL ?? 'http://127.0.0.1:8789/mcp'
};

const app = Fastify({ logger: true });
const messages = new Map<string, unknown[]>();
const inbox: unknown[] = [];

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

app.get('/topology', async () => {
  if (axlNodeUrl) {
    try {
      const response = await fetch(`${axlNodeUrl.replace(/\/$/, '')}/topology`);
      if (response.ok) return response.json();
    } catch (error) {
      app.log.warn({ error }, 'AXL topology proxy failed');
    }
  }

  return {
    ok: true,
    mode: axlMode,
    our_public_key: axlAgentId,
    peers: [],
    tree: [],
    source: axlNodeUrl ? 'axl-node-unavailable' : 'local-adapter'
  };
});

app.post('/send', async (request, reply) => {
  const parsed = transportEnvelopeSchema.safeParse(request.body);
  const peerId = request.headers['x-destination-peer-id'];

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  const message = {
    id: parsed.data.messageId ?? randomUUID(),
    createdAt: parsed.data.createdAt ?? new Date().toISOString(),
    transport: axlNodeUrl ? 'axl-node-proxy' : 'local-adapter',
    peerId: typeof peerId === 'string' ? peerId : undefined,
    ...parsed.data
  };

  const workflowMessages = messages.get(parsed.data.workflowId) ?? [];
  workflowMessages.push(message);
  messages.set(parsed.data.workflowId, workflowMessages);
  inbox.push(message);

  if (axlNodeUrl) {
    try {
      const response = await fetch(`${axlNodeUrl.replace(/\/$/, '')}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(typeof peerId === 'string' ? { 'X-Destination-Peer-Id': peerId } : {})
        },
        body: JSON.stringify(parsed.data)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return reply.code(502).send({ ok: false, error: 'axl_node_send_failed', status: response.status, message, details: errorText.slice(0, 160) });
      }

      return reply.send({ ok: true, message, transport: 'axl-node-proxy' });
    } catch (error) {
      app.log.warn({ error }, 'AXL send proxy failed');
      return reply.code(502).send({ ok: false, error: 'axl_node_unavailable', message });
    }
  }

  return reply.send({ ok: true, message, transport: 'local-adapter' });
});

app.get('/recv', async (request) => {
  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 1), 50);
  return {
    ok: true,
    messages: inbox.splice(0, limit)
  };
});

app.post('/mcp/:peerId/:service', async (request, reply) => {
  const { peerId, service } = request.params as { peerId: string; service: string };
  const serviceUrl = mcpServiceUrls[service];

  if (!serviceUrl) {
    return reply.code(404).send({ ok: false, error: 'mcp_service_not_configured', peerId, service });
  }

  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-AXL-Peer-Id': peerId,
        'X-AXL-Service': service
      },
      body: JSON.stringify(request.body ?? {})
    });

    const payload = await response.text();
    return reply
      .code(response.status)
      .type(response.headers.get('content-type') ?? 'application/json')
      .send(payload);
  } catch (error) {
    app.log.warn({ error, peerId, service }, 'MCP service proxy failed');
    return reply.code(502).send({ ok: false, error: 'mcp_service_unavailable', peerId, service });
  }
});

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
