import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { z } from 'zod';

const port = Number(process.env.PORT ?? 8793);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const pinataJwt = process.env.PINATA_JWT;
const maxUploadBytes = Number(process.env.IPFS_UPLOAD_MAX_BYTES ?? process.env.ENS_PROFILE_IMAGE_MAX_BYTES ?? 10_000_000);

const normalizePinataGatewayUrl = (value: string) => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const withoutTrailingSlash = withProtocol.replace(/\/$/, '');
  return /\/ipfs$/i.test(withoutTrailingSlash) ? withoutTrailingSlash : `${withoutTrailingSlash}/ipfs`;
};
const pinataGatewayUrl = normalizePinataGatewayUrl(process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs');

const metadataSchema = z.object({
  kind: z.string().min(1).max(80).optional().default('file'),
  app: z.string().min(1).max(80).optional().default('CounterAgent'),
  sourcePlugin: z.string().min(1).max(160).optional().default('unknown')
});

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: maxUploadBytes
  }
});

app.get('/healthz', async () => ({ ok: true, status: 'live', plugin: 'OpenClaw/Plugin-IPFS-Pinata' }));

app.post('/ipfs/upload', async (request, reply) => {
  if (!pinataJwt) {
    return reply.code(503).send({ ok: false, error: 'pinata_not_configured' });
  }

  const file = await request.file();
  if (!file) {
    return reply.code(400).send({ ok: false, error: 'missing_file' });
  }

  const fieldValue = (name: string) => {
    const field = file.fields[name];
    return typeof field === 'object' && field && 'value' in field ? String(field.value) : undefined;
  };

  const metadata = metadataSchema.parse({
    kind: fieldValue('kind'),
    app: fieldValue('app'),
    sourcePlugin: fieldValue('sourcePlugin')
  });

  try {
    const buffer = await file.toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.filename || `${metadata.kind}.bin`);
    form.append('network', 'public');
    form.append('name', `${metadata.app}-${metadata.kind}-${Date.now()}-${file.filename || 'file'}`);
    form.append(
      'keyvalues',
      JSON.stringify({
        app: metadata.app,
        sourcePlugin: metadata.sourcePlugin,
        kind: metadata.kind
      })
    );

    const pinataResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pinataJwt}` },
      body: form
    });
    const payload = await pinataResponse.json().catch(() => ({}));

    if (!pinataResponse.ok) {
      request.log.error({ status: pinataResponse.status, payload }, 'Pinata upload failed');
      return reply.code(502).send({ ok: false, error: 'pinata_upload_failed' });
    }

    const cid = payload?.data?.cid;
    if (!cid || typeof cid !== 'string') {
      request.log.error({ payload }, 'Pinata upload response missing CID');
      return reply.code(502).send({ ok: false, error: 'pinata_missing_cid' });
    }

    return reply.send({
      ok: true,
      kind: metadata.kind,
      cid,
      ipfsUri: `ipfs://${cid}`,
      url: `${pinataGatewayUrl}/${cid}`,
      mimeType: file.mimetype,
      size: buffer.byteLength,
      preparedBy: 'OpenClaw/Plugin-IPFS-Pinata'
    });
  } catch (error) {
    request.log.error({ error }, 'IPFS upload failed');
    return reply.code(502).send({ ok: false, error: 'ipfs_upload_failed' });
  }
});

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
