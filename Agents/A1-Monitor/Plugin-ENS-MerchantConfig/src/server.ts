import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  namehash,
  parseAbi,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { z } from 'zod';

const registrarAbi = parseAbi([
  'function provisionMerchant(string label,address merchant,uint256 fxThresholdBps,string riskTolerance,string preferredStablecoin,string telegramChatId,string registryAddress) returns (bytes32 node)',
  'function provisioners(address provisioner) view returns (bool)',
  'function owner() view returns (address)',
  'event MerchantSubnameProvisioned(bytes32 indexed node,bytes32 indexed labelhash,string label,string name,address indexed merchant,uint256 fxThresholdBps,string riskTolerance,string preferredStablecoin,string registryAddress)'
]);

const ensRegistryAbi = parseAbi([
  'function resolver(bytes32 node) view returns (address)',
  'function owner(bytes32 node) view returns (address)'
]);

const publicResolverAbi = parseAbi([
  'function addr(bytes32 node) view returns (address)',
  'function text(bytes32 node,string key) view returns (string)'
]);

const counterAgentEnsRecordKeys = [
  'counteragent.wallet',
  'counteragent.fx_threshold_bps',
  'counteragent.risk_tolerance',
  'counteragent.preferred_stablecoin',
  'counteragent.telegram_chat_id',
  'counteragent.registry',
  'counteragent.version',
  'counteragent.merchant_image',
  'counteragent.header',
  'counteragent.subnames',
  'avatar',
  'header',
  'url',
  'description',
  'com.twitter',
  'com.github',
  'com.discord',
  'org.telegram',
  'com.linkedin',
  'com.instagram'
] as const;

const profileRecordSchema = z.object({
  merchantImage: z.string().url().max(500).optional().or(z.literal('')),
  header: z.string().url().max(500).optional().or(z.literal('')),
  website: z.string().url().max(500).optional().or(z.literal('')),
  description: z.string().max(500).optional().default(''),
  socials: z
    .object({
      twitter: z.string().max(120).optional().default(''),
      github: z.string().max(120).optional().default(''),
      discord: z.string().max(120).optional().default(''),
      telegram: z.string().max(120).optional().default(''),
      linkedin: z.string().max(200).optional().default(''),
      instagram: z.string().max(120).optional().default('')
    })
    .optional()
    .default({}),
  subnames: z.array(z.string().min(1).max(255)).max(25).optional().default([])
});

const zeroAddress = '0x0000000000000000000000000000000000000000' as const;
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const provisionSchema = z.object({
  label: z.string().min(1).max(63).regex(labelPattern, 'Use lowercase letters, numbers, and internal hyphens only'),
  merchantWallet: z.string().refine(isAddress, 'Invalid merchant wallet'),
  fxThresholdBps: z.number().int().min(0).max(10_000),
  riskTolerance: z.string().min(1).max(40),
  preferredStablecoin: z.string().min(1).max(40),
  telegramChatId: z.string().max(120).optional().default(''),
  registryAddress: z.string().max(120).optional()
});

const port = Number(process.env.PORT ?? 8788);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'https://counteragent.netlify.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ensRpcUrl = process.env.ENS_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const ensRegistryAddress = (process.env.ENS_REGISTRY_ADDRESS ?? '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') as Address;
const ensRegistrarAddress = process.env.ENS_REGISTRAR_ADDRESS as Address | undefined;
const defaultRegistryAddress = process.env.MERCHANT_REGISTRY_ADDRESS ?? '';
const parentName = process.env.ENS_PARENT_NAME ?? 'counteragents.eth';
const ensLookupFromBlock = process.env.ENS_LOOKUP_FROM_BLOCK ? BigInt(process.env.ENS_LOOKUP_FROM_BLOCK) : null;
const ensLookupBlockWindow = BigInt(process.env.ENS_LOOKUP_BLOCK_WINDOW ?? '50000');
const provisionerPrivateKey = process.env.A1_ENS_MONITOR_PRIVATE_KEY as Hex | undefined;
const ipfsPluginUrl = process.env.IPFS_PLUGIN_URL;
const pinataJwt = process.env.PINATA_JWT;
const normalizePinataGatewayUrl = (value: string) => {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const withoutTrailingSlash = withProtocol.replace(/\/$/, '');
  return /\/ipfs$/i.test(withoutTrailingSlash) ? withoutTrailingSlash : `${withoutTrailingSlash}/ipfs`;
};
const pinataGatewayUrl = normalizePinataGatewayUrl(process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs');
const maxEnsImageBytes = Number(process.env.ENS_PROFILE_IMAGE_MAX_BYTES ?? 10_000_000);

type IpfsUploadResult = {
  ok: true;
  kind: string;
  cid: string;
  ipfsUri: string;
  url: string;
  mimeType: string;
  size: number;
  preparedBy?: string;
};

const app = Fastify({ logger: true });

type RecentMonitorEvent = {
  agent: 'A1';
  type: 'ens-config' | 'merchant-lookup' | 'wallet-watch' | 'threshold-signal' | 'provision';
  merchant: string;
  ensName?: string;
  status: 'loaded' | 'not-found' | 'watching' | 'signal' | 'provisioned' | 'error';
  fxThresholdBps?: string;
  riskTolerance?: string;
  preferredStablecoin?: string;
  summary: string;
  timestamp: string;
};

const recentMonitorEvents = new Map<string, RecentMonitorEvent[]>();
const recentLimit = Number(process.env.RECENT_EVENT_LIMIT ?? 20);
const merchantKey = (value: string) => value.toLowerCase();

function pushRecentMonitorEvent(event: RecentMonitorEvent) {
  const key = merchantKey(event.merchant);
  const items = recentMonitorEvents.get(key) ?? [];
  items.unshift(event);
  recentMonitorEvents.set(key, items.slice(0, recentLimit));
}

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
});

await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: maxEnsImageBytes
  }
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(ensRpcUrl)
});

const requireRegistrar = () => {
  if (!ensRegistrarAddress || !isAddress(ensRegistrarAddress)) {
    throw new Error('ENS_REGISTRAR_ADDRESS is not configured');
  }
  return ensRegistrarAddress;
};

const requireProvisionerAccount = () => {
  if (!provisionerPrivateKey) {
    throw new Error('A1_ENS_MONITOR_PRIVATE_KEY is not configured');
  }
  return privateKeyToAccount(provisionerPrivateKey);
};

const fullNameForLabel = (label: string) => `${label}.${parentName}`;

const readText = async (resolver: Address, node: Hex, key: string) => {
  try {
    return await publicClient.readContract({
      address: resolver,
      abi: publicResolverAbi,
      functionName: 'text',
      args: [node, key]
    });
  } catch {
    return '';
  }
};

const readCounterAgentEnsRecords = async (resolver: Address, node: Hex) => {
  const entries = await Promise.all(counterAgentEnsRecordKeys.map(async (key) => [key, await readText(resolver, node, key)] as const));
  return Object.fromEntries(entries) as Record<(typeof counterAgentEnsRecordKeys)[number], string>;
};

const normalizeHandle = (value = '') => value.trim().replace(/^@/, '');

const buildProfileRecordMap = (input: z.infer<typeof profileRecordSchema>) => {
  const twitter = normalizeHandle(input.socials.twitter);
  const github = normalizeHandle(input.socials.github);
  const telegram = normalizeHandle(input.socials.telegram);
  const instagram = normalizeHandle(input.socials.instagram);

  return {
    avatar: input.merchantImage || '',
    header: input.header || '',
    url: input.website || '',
    description: input.description || '',
    'counteragent.merchant_image': input.merchantImage || '',
    'counteragent.header': input.header || '',
    'counteragent.subnames': input.subnames.map((name) => name.trim().toLowerCase()).filter(Boolean).join(','),
    'com.twitter': twitter,
    'com.github': github,
    'com.discord': input.socials.discord?.trim() || '',
    'org.telegram': telegram,
    'com.linkedin': input.socials.linkedin?.trim() || '',
    'com.instagram': instagram
  };
};

const appendIpfsMetadata = (form: FormData, kind: string, filename?: string) => {
  form.append('app', 'CounterAgent');
  form.append('sourcePlugin', 'A1-Monitor/Plugin-ENS-MerchantConfig');
  form.append('kind', kind);
  form.append('name', `counteragent-ens-${kind}-${Date.now()}-${filename || 'image'}`);
};

const uploadViaOpenClawIpfsPlugin = async (buffer: Buffer, file: { mimetype: string; filename?: string }, kind: string) => {
  if (!ipfsPluginUrl) return null;

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.filename || `counteragent-ens-${kind}.png`);
  appendIpfsMetadata(form, kind, file.filename);

  const response = await fetch(`${ipfsPluginUrl.replace(/\/$/, '')}/ipfs/upload`, {
    method: 'POST',
    body: form
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `ipfs_plugin_upload_failed_${response.status}`);
  }

  return payload as IpfsUploadResult;
};

const uploadDirectlyToPinata = async (buffer: Buffer, file: { mimetype: string; filename?: string }, kind: string) => {
  if (!pinataJwt) {
    throw new Error('pinata_not_configured');
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.filename || `counteragent-ens-${kind}.png`);
  form.append('network', 'public');
  form.append('name', `counteragent-ens-${kind}-${Date.now()}-${file.filename || 'image'}`);
  form.append(
    'keyvalues',
    JSON.stringify({
      app: 'CounterAgent',
      sourcePlugin: 'A1-Monitor/Plugin-ENS-MerchantConfig',
      kind
    })
  );

  const pinataResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pinataJwt}`
    },
    body: form
  });
  const payload = await pinataResponse.json().catch(() => ({}));

  if (!pinataResponse.ok) {
    throw new Error('pinata_upload_failed');
  }

  const cid = payload?.data?.cid;
  if (!cid || typeof cid !== 'string') {
    throw new Error('pinata_missing_cid');
  }

  return {
    ok: true,
    kind,
    cid,
    ipfsUri: `ipfs://${cid}`,
    url: `${pinataGatewayUrl}/${cid}`,
    mimeType: file.mimetype,
    size: buffer.byteLength,
    preparedBy: 'A1-Monitor/Plugin-ENS-MerchantConfig'
  } satisfies IpfsUploadResult;
};

app.get('/healthz', async () => ({ ok: true, status: 'live', role: 'ens-monitor' }));

app.get('/monitor/recent', async (request, reply) => {
  const merchant = typeof (request.query as { merchant?: unknown }).merchant === 'string'
    ? (request.query as { merchant: string }).merchant
    : '';

  if (!isAddress(merchant)) {
    return reply.code(400).send({ ok: false, error: 'invalid_merchant' });
  }

  const limit = Math.min(Number((request.query as { limit?: string }).limit ?? recentLimit), recentLimit);
  return reply.send({ ok: true, merchant, monitor: (recentMonitorEvents.get(merchantKey(merchant)) ?? []).slice(0, limit) });
});

app.get('/ens/merchant/:wallet', async (request, reply) => {
  const { wallet } = request.params as { wallet: string };

  if (!isAddress(wallet)) {
    return reply.code(400).send({ ok: false, error: 'invalid_wallet' });
  }

  try {
    const registrar = requireRegistrar();
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = ensLookupFromBlock ?? (latestBlock > ensLookupBlockWindow ? latestBlock - ensLookupBlockWindow : 0n);
    const events = await publicClient.getContractEvents({
      address: registrar,
      abi: registrarAbi,
      eventName: 'MerchantSubnameProvisioned',
      args: { merchant: wallet as Address },
      fromBlock,
      toBlock: latestBlock
    });

    const latest = events.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return Number((b.logIndex ?? 0) - (a.logIndex ?? 0));
      return a.blockNumber > b.blockNumber ? -1 : 1;
    })[0];

    if (!latest) {
      pushRecentMonitorEvent({
        agent: 'A1',
        type: 'merchant-lookup',
        merchant: wallet,
        status: 'not-found',
        summary: 'Monitor checked ENS merchant config; no CounterAgent subname found yet.',
        timestamp: new Date().toISOString()
      });
      return reply.code(404).send({ ok: false, error: 'ens_merchant_not_found', merchantWallet: wallet });
    }

    const args = latest.args;
    if (!args.node || !args.name || !args.label || !args.merchant || args.fxThresholdBps === undefined) {
      throw new Error('ens_event_missing_fields');
    }

    const node = args.node;
    const resolver = await publicClient.readContract({
      address: ensRegistryAddress,
      abi: ensRegistryAbi,
      functionName: 'resolver',
      args: [node]
    });
    const owner = await publicClient.readContract({
      address: ensRegistryAddress,
      abi: ensRegistryAbi,
      functionName: 'owner',
      args: [node]
    });

    let resolvedAddress: Address = zeroAddress;
    let records: Record<string, string> = {};
    if (resolver !== zeroAddress) {
      resolvedAddress = await publicClient.readContract({
        address: resolver,
        abi: publicResolverAbi,
        functionName: 'addr',
        args: [node]
      });
      records = await readCounterAgentEnsRecords(resolver, node);
    }

    pushRecentMonitorEvent({
      agent: 'A1',
      type: 'ens-config',
      merchant: wallet,
      ensName: args.name,
      status: 'loaded',
      fxThresholdBps: records['counteragent.fx_threshold_bps'] || args.fxThresholdBps.toString(),
      riskTolerance: records['counteragent.risk_tolerance'] || args.riskTolerance,
      preferredStablecoin: records['counteragent.preferred_stablecoin'] || args.preferredStablecoin,
      summary: `Loaded ENS treasury config for ${args.name}.`,
      timestamp: new Date().toISOString()
    });

    return reply.send({
      ok: true,
      name: args.name,
      label: args.label,
      node,
      owner,
      resolver,
      address: resolvedAddress,
      merchantWallet: args.merchant,
      transactionHash: latest.transactionHash,
      blockNumber: latest.blockNumber.toString(),
      records: {
        ...records,
        fxThresholdBps: records['counteragent.fx_threshold_bps'] || args.fxThresholdBps.toString(),
        riskTolerance: records['counteragent.risk_tolerance'] || args.riskTolerance,
        preferredStablecoin: records['counteragent.preferred_stablecoin'] || args.preferredStablecoin,
        registryAddress: records['counteragent.registry'] || args.registryAddress
      }
    });
  } catch (error) {
    request.log.error({ error, wallet }, 'ENS merchant lookup failed');
    return reply.code(502).send({ ok: false, error: 'ens_merchant_lookup_failed' });
  }
});

app.post('/ens/profile/records', async (request, reply) => {
  const parsed = profileRecordSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  return reply.send({
    ok: true,
    records: buildProfileRecordMap(parsed.data),
    note: 'Submit these text records to the ENS public resolver from the wallet that owns the ENS name.'
  });
});

app.post('/ens/profile/upload', async (request, reply) => {
  if (!ipfsPluginUrl && !pinataJwt) {
    return reply.code(503).send({ ok: false, error: 'ipfs_not_configured' });
  }

  const file = await request.file();
  if (!file) {
    return reply.code(400).send({ ok: false, error: 'missing_file' });
  }

  const kind = typeof file.fields.kind === 'object' && 'value' in file.fields.kind ? String(file.fields.kind.value) : 'avatar';
  if (kind !== 'avatar' && kind !== 'header') {
    return reply.code(400).send({ ok: false, error: 'invalid_kind' });
  }
  if (!file.mimetype.startsWith('image/')) {
    return reply.code(400).send({ ok: false, error: 'invalid_mime_type', mimeType: file.mimetype });
  }

  try {
    const buffer = await file.toBuffer();
    const result = (await uploadViaOpenClawIpfsPlugin(buffer, file, kind)) ?? (await uploadDirectlyToPinata(buffer, file, kind));

    return reply.send({
      ...result,
      preparedBy: 'A1-Monitor/Plugin-ENS-MerchantConfig',
      storagePlugin: result.preparedBy ?? 'direct-pinata'
    });
  } catch (error) {
    request.log.error({ error }, 'ENS profile image upload failed');
    return reply.code(502).send({ ok: false, error: 'ens_profile_image_upload_failed' });
  }
});

app.post('/ens/provision', async (request, reply) => {
  const parsed = provisionSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  try {
    const registrar = requireRegistrar();
    const account = requireProvisionerAccount();
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(ensRpcUrl)
    });

    const data = parsed.data;
    const registryAddress = data.registryAddress || defaultRegistryAddress;
    const name = fullNameForLabel(data.label);

    const allowed = await publicClient.readContract({
      address: registrar,
      abi: registrarAbi,
      functionName: 'provisioners',
      args: [account.address]
    });

    const owner = await publicClient.readContract({
      address: registrar,
      abi: registrarAbi,
      functionName: 'owner'
    });

    if (!allowed && owner.toLowerCase() !== account.address.toLowerCase()) {
      return reply.code(403).send({
        ok: false,
        error: 'provisioner_not_authorized',
        provisioner: account.address
      });
    }

    const hash = await walletClient.writeContract({
      address: registrar,
      abi: registrarAbi,
      functionName: 'provisionMerchant',
      args: [
        data.label,
        data.merchantWallet as Address,
        BigInt(data.fxThresholdBps),
        data.riskTolerance,
        data.preferredStablecoin,
        data.telegramChatId,
        registryAddress
      ]
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const node = namehash(name);

    pushRecentMonitorEvent({
      agent: 'A1',
      type: 'provision',
      merchant: data.merchantWallet,
      ensName: name,
      status: 'provisioned',
      fxThresholdBps: data.fxThresholdBps.toString(),
      riskTolerance: data.riskTolerance,
      preferredStablecoin: data.preferredStablecoin,
      summary: `Provisioned ENS treasury config for ${name}.`,
      timestamp: new Date().toISOString()
    });

    return reply.send({
      ok: true,
      name,
      node,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      provisioner: account.address,
      merchantWallet: data.merchantWallet
    });
  } catch (error) {
    request.log.error({ error }, 'ENS provisioning failed');
    return reply.code(502).send({ ok: false, error: 'ens_provision_failed' });
  }
});

app.get('/ens/config/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  const normalizedName = name.toLowerCase();

  if (!normalizedName.endsWith(`.${parentName}`) || normalizedName.split('.').length !== parentName.split('.').length + 1) {
    return reply.code(400).send({ ok: false, error: 'invalid_ens_name' });
  }

  try {
    const node = namehash(normalizedName);
    const resolver = await publicClient.readContract({
      address: ensRegistryAddress,
      abi: ensRegistryAbi,
      functionName: 'resolver',
      args: [node]
    });
    const owner = await publicClient.readContract({
      address: ensRegistryAddress,
      abi: ensRegistryAbi,
      functionName: 'owner',
      args: [node]
    });

    if (resolver === zeroAddress || owner === zeroAddress) {
      return reply.code(404).send({ ok: false, error: 'ens_name_not_found', name: normalizedName });
    }

    const records = await readCounterAgentEnsRecords(resolver, node);

    const resolvedAddress = await publicClient.readContract({
      address: resolver,
      abi: publicResolverAbi,
      functionName: 'addr',
      args: [node]
    });

    return reply.send({
      ok: true,
      name: normalizedName,
      node,
      owner,
      resolver,
      address: resolvedAddress,
      records: {
        ...records,
        wallet: records['counteragent.wallet'],
        fxThresholdBps: records['counteragent.fx_threshold_bps'],
        riskTolerance: records['counteragent.risk_tolerance'],
        preferredStablecoin: records['counteragent.preferred_stablecoin'],
        telegramChatId: records['counteragent.telegram_chat_id'],
        registryAddress: records['counteragent.registry'],
        version: records['counteragent.version']
      }
    });
  } catch (error) {
    request.log.error({ error }, 'ENS config read failed');
    return reply.code(502).send({ ok: false, error: 'ens_config_read_failed' });
  }
});

await app.listen({ port, host: '0.0.0.0' });
