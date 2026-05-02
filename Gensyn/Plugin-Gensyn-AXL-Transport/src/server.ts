import cors from '@fastify/cors';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const jsonRpcSchema = z.object({
  jsonrpc: z.string().optional(),
  id: z.unknown().optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional().default({})
});

const envelopeSchema = z.object({
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

type Envelope = z.infer<typeof envelopeSchema> & {
  id: string;
  receivedAt: string;
  transport: string;
  peerId?: string;
};

const port = Number(process.env.PORT ?? 8792);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const agentId = process.env.AXL_AGENT_ID ?? 'CounterAgent';
const agentRole = process.env.AXL_AGENT_ROLE ?? agentId;
const axlMode = (process.env.AXL_MODE ?? 'local').toLowerCase();
const axlNodeUrl = process.env.AXL_NODE_URL?.replace(/\/$/, '');
const requireRealNode = process.env.AXL_REQUIRE_REAL_NODE === 'true';
const realMode = axlMode === 'real';
const inboxLimit = Number(process.env.AXL_INBOX_LIMIT ?? 200);

const peers: Record<string, string | undefined> = {
  A0: process.env.AXL_PEER_A0,
  A1: process.env.AXL_PEER_A1,
  A2: process.env.AXL_PEER_A2,
  A3: process.env.AXL_PEER_A3,
  A4: process.env.AXL_PEER_A4
};

const localPeerUrls: Record<string, string | undefined> = {
  A0: process.env.AXL_LOCAL_A0_URL,
  A1: process.env.AXL_LOCAL_A1_URL,
  A2: process.env.AXL_LOCAL_A2_URL,
  A3: process.env.AXL_LOCAL_A3_URL,
  A4: process.env.AXL_LOCAL_A4_URL
};

const mcpServiceUrls: Record<string, string | undefined> = {
  'counteragent-monitor': process.env.AXL_SERVICE_A1_URL,
  'counteragent-decision': process.env.AXL_SERVICE_A2_URL,
  'counteragent-execution': process.env.AXL_SERVICE_A3_URL,
  'counteragent-reporting': process.env.AXL_SERVICE_A4_URL
};

const app = Fastify({ logger: true });
const inbox: Envelope[] = [];
const sent: Envelope[] = [];

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

function pushInbox(message: Envelope) {
  inbox.unshift(message);
  inbox.splice(inboxLimit);
}

function pushSent(message: Envelope) {
  sent.unshift(message);
  sent.splice(inboxLimit);
}

function normalizeEnvelope(input: z.infer<typeof envelopeSchema>, transport: string, peerId?: string): Envelope {
  return {
    ...input,
    id: input.messageId ?? randomUUID(),
    messageId: input.messageId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    transport,
    peerId
  };
}

function roleFromPeerId(peerId?: string) {
  if (!peerId) return undefined;
  return Object.entries(peers).find(([, value]) => value === peerId)?.[0];
}

async function forwardLocal(peerId: string | undefined, envelope: z.infer<typeof envelopeSchema>) {
  const role = roleFromPeerId(peerId);
  const targetUrl = role ? localPeerUrls[role] : undefined;
  if (!targetUrl) return { ok: false, error: 'local_peer_not_configured', role, peerId };

  const response = await fetch(`${targetUrl.replace(/\/$/, '')}/local/inbox`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-AXL-Forwarded-By': agentId },
    body: JSON.stringify(envelope)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: 'local_peer_forward_failed', status: response.status, payload };
  return { ok: true, role, peerId, payload };
}

async function proxyRealSend(peerId: string | undefined, envelope: z.infer<typeof envelopeSchema>) {
  if (!axlNodeUrl) return { ok: false, error: 'real_axl_node_not_configured' };
  if (!peerId) return { ok: false, error: 'peer_not_configured' };

  const response = await fetch(`${axlNodeUrl}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Destination-Peer-Id': peerId },
    body: JSON.stringify(envelope)
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) return { ok: false, error: 'real_axl_send_failed', status: response.status, details: text.slice(0, 160) };
  return { ok: true, peerId, status: response.status };
}

app.get('/healthz', async () => ({
  ok: true,
  status: 'live',
  role: 'gensyn-axl-transport',
  agentId,
  agentRole,
  mode: axlMode,
  nodeConfigured: Boolean(axlNodeUrl),
  requireRealNode,
  realReady: !realMode || Boolean(axlNodeUrl),
  peers: Object.fromEntries(Object.entries(peers).map(([key, value]) => [key, Boolean(value)])),
  inboxSize: inbox.length,
  sentSize: sent.length
}));

app.get('/topology', async () => {
  if (realMode || axlNodeUrl) {
    if (!axlNodeUrl) throw new Error('real_axl_node_not_configured');
    const response = await fetch(`${axlNodeUrl}/topology`);
    if (!response.ok) throw new Error(`real_axl_topology_failed:${response.status}`);
    return response.json();
  }

  if (requireRealNode) throw new Error('real_axl_node_not_configured');

  return {
    ok: true,
    mode: 'local-plugin',
    our_public_key: peers[agentRole] ?? `${agentRole.toLowerCase()}-local-peer`,
    agentId,
    agentRole,
    peers: Object.entries(peers)
      .filter(([, value]) => Boolean(value))
      .map(([role, peerId]) => ({ role, peerId })),
    source: 'counteragent-shared-plugin'
  };
});

app.post('/send', async (request, reply) => {
  const parsed = envelopeSchema.safeParse(request.body);
  const headerPeer = request.headers['x-destination-peer-id'];
  const peerId = typeof headerPeer === 'string' ? headerPeer : undefined;

  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  const sentMessage = normalizeEnvelope(parsed.data, realMode ? 'real-axl' : 'local-plugin', peerId);
  pushSent(sentMessage);

  const result = realMode
    ? await proxyRealSend(peerId, parsed.data)
    : await forwardLocal(peerId, parsed.data);

  if (!result.ok) return reply.code(502).send({ ok: false, message: sentMessage, result });
  return reply.send({ ok: true, message: sentMessage, result });
});

app.post('/local/inbox', async (request, reply) => {
  const parsed = envelopeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: 'invalid_request', details: parsed.error.flatten() });
  }

  const message = normalizeEnvelope(parsed.data, 'local-plugin');
  pushInbox(message);
  return reply.send({ ok: true, message });
});

app.get('/recv', async (request) => {
  const query = request.query as { limit?: string; drain?: string };
  const limit = Math.min(Number(query.limit ?? 20), 100);

  if (realMode) {
    if (!axlNodeUrl) throw new Error('real_axl_node_not_configured');
    const messages: Envelope[] = [];
    for (let index = 0; index < limit; index += 1) {
      const response = await fetch(`${axlNodeUrl}/recv`);
      if (response.status === 204 || response.status === 404) break;
      const text = await response.text().catch(() => '');
      if (!response.ok || !text.trim()) break;

      const fromPeer = response.headers.get('x-from-peer-id') ?? undefined;
      try {
        const parsed = envelopeSchema.parse(JSON.parse(text));
        messages.push(normalizeEnvelope(parsed, 'real-axl', fromPeer));
      } catch {
        messages.push(normalizeEnvelope({
          workflowId: `real-axl-${Date.now()}`,
          messageId: randomUUID(),
          fromAgent: fromPeer ?? 'unknown-peer',
          toAgent: agentId,
          messageType: 'raw-message',
          payload: { body: text }
        }, 'real-axl', fromPeer));
      }
    }
    return { ok: true, agentId, agentRole, messages };
  }

  const drain = query.drain !== 'false';
  const messages = drain ? inbox.splice(0, limit) : inbox.slice(0, limit);
  return { ok: true, agentId, agentRole, messages };
});

app.get('/sent', async (request) => {
  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 20), 100);
  return { ok: true, agentId, agentRole, messages: sent.slice(0, limit) };
});

app.post('/route', async (request, reply) => {
  const parsed = z.object({
    service: z.string().min(1),
    request: z.unknown(),
    from_peer_id: z.string().optional()
  }).safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_router_request' });
  }

  const serviceUrl = mcpServiceUrls[parsed.data.service];
  if (!serviceUrl) {
    return reply.code(404).send({ error: 'mcp_service_not_configured' });
  }

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-AXL-Peer-Id': parsed.data.from_peer_id ?? '', 'X-AXL-Service': parsed.data.service },
    body: typeof parsed.data.request === 'string' ? parsed.data.request : JSON.stringify(parsed.data.request)
  });
  const text = await response.text();
  if (!response.ok) return reply.code(response.status).send({ error: text });

  try {
    return reply.send({ response: JSON.parse(text) });
  } catch {
    return reply.send({ response: text });
  }
});

app.post('/mcp/:peerId/:service', async (request, reply) => {
  const parsed = jsonRpcSchema.safeParse(request.body);
  const { peerId, service } = request.params as { peerId: string; service: string };
  if (!parsed.success) {
    return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid_request' } });
  }

  if (realMode) {
    if (!axlNodeUrl) {
      return reply.code(502).send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32050, message: 'real_axl_node_not_configured' } });
    }
    const response = await fetch(`${axlNodeUrl}/mcp/${peerId}/${service}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });
    const text = await response.text();
    return reply.code(response.status).type(response.headers.get('content-type') ?? 'application/json').send(text);
  }

  const serviceUrl = mcpServiceUrls[service];
  if (!serviceUrl) {
    return reply.code(404).send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32004, message: 'mcp_service_not_configured' } });
  }

  await forwardLocal(peerId, {
    workflowId: typeof parsed.data.id === 'string' ? parsed.data.id.split(':')[0] : `mcp-${Date.now()}`,
    messageId: randomUUID(),
    fromAgent: agentId,
    toAgent: roleFromPeerId(peerId) ?? peerId,
    messageType: 'mcp-call',
    createdAt: new Date().toISOString(),
    payload: { service, method: parsed.data.method, tool: typeof parsed.data.params.name === 'string' ? parsed.data.params.name : undefined }
  }).catch((error) => app.log.warn({ error, peerId, service }, 'local MCP trace forward failed'));

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-AXL-Peer-Id': peerId, 'X-AXL-Service': service },
    body: JSON.stringify(parsed.data)
  });
  const text = await response.text();
  return reply.code(response.status).type(response.headers.get('content-type') ?? 'application/json').send(text);
});

await app.listen({ port, host: '0.0.0.0' });
