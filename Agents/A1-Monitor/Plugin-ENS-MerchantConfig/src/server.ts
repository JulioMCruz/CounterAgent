import cors from '@fastify/cors';
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
  'function owner() view returns (address)'
]);

const ensRegistryAbi = parseAbi([
  'function resolver(bytes32 node) view returns (address)',
  'function owner(bytes32 node) view returns (address)'
]);

const publicResolverAbi = parseAbi([
  'function addr(bytes32 node) view returns (address)',
  'function text(bytes32 node,string key) view returns (string)'
]);

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
const parentName = process.env.ENS_PARENT_NAME ?? 'counteragent.eth';
const provisionerPrivateKey = process.env.A1_ENS_MONITOR_PRIVATE_KEY as Hex | undefined;

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigins,
  methods: ['POST', 'GET', 'OPTIONS']
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

app.get('/healthz', async () => ({ ok: true, status: 'live', role: 'ens-monitor' }));

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

    const [wallet, fxThresholdBps, riskTolerance, preferredStablecoin, telegramChatId, registryAddress, version] =
      await Promise.all([
        readText(resolver, node, 'counteragent.wallet'),
        readText(resolver, node, 'counteragent.fx_threshold_bps'),
        readText(resolver, node, 'counteragent.risk_tolerance'),
        readText(resolver, node, 'counteragent.preferred_stablecoin'),
        readText(resolver, node, 'counteragent.telegram_chat_id'),
        readText(resolver, node, 'counteragent.registry'),
        readText(resolver, node, 'counteragent.version')
      ]);

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
        wallet,
        fxThresholdBps,
        riskTolerance,
        preferredStablecoin,
        telegramChatId,
        registryAddress,
        version
      }
    });
  } catch (error) {
    request.log.error({ error }, 'ENS config read failed');
    return reply.code(502).send({ ok: false, error: 'ens_config_read_failed' });
  }
});

await app.listen({ port, host: '0.0.0.0' });
