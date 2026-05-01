#!/usr/bin/env node
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, loadCircleBaseSepoliaTokens, requiredAddress } from './lib.mjs';

const poolManager = requiredAddress('V4_POOL_MANAGER_84532', '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408');
const tokens = loadCircleBaseSepoliaTokens();
const fee = Number(process.env.V4_POOL_FEE || 500);
const tickSpacing = Number(process.env.V4_TICK_SPACING || 10);
const hook = '0x0000000000000000000000000000000000000000';
const initialPrice = process.env.INITIAL_PRICE_TOKEN1_PER_TOKEN0 || '1';
const abi = parseAbi(['function initialize((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,uint160 sqrtPriceX96) external returns (int24 tick)']);

function ordered(a, b) { const aa = getAddress(a), bb = getAddress(b); return BigInt(aa) < BigInt(bb) ? [aa, bb] : [bb, aa]; }
function sqrt(v) { if (v < 2n) return v; let x0 = v / 2n, x1 = (x0 + v / x0) / 2n; while (x1 < x0) { x0 = x1; x1 = (x0 + v / x0) / 2n; } return x0; }
function ratio(v, d = 18) { const [w, f = ''] = String(v).split('.'); const s = 10n ** BigInt(d); return { n: BigInt(w || '0') * s + BigInt((f + '0'.repeat(d)).slice(0, d)), q: s }; }
function sqrtPriceX96FromPrice(v) { const { n, q } = ratio(v); return sqrt((n << 192n) / q); }

const [currency0, currency1] = ordered(tokens.USDC, tokens.EURC);
const key = { currency0, currency1, fee, tickSpacing, hooks: hook };
const sqrtPriceX96 = sqrtPriceX96FromPrice(initialPrice);
const data = encodeFunctionData({ abi, functionName: 'initialize', args: [key, sqrtPriceX96] });

console.log('Uniswap v4 Base Sepolia pool initialize');
console.log('PoolManager:', poolManager);
console.log('USDC:', tokens.USDC);
console.log('EURC:', tokens.EURC);
console.log('PoolKey:', key);
console.log('Initial price token1/token0:', initialPrice);
console.log('sqrtPriceX96:', sqrtPriceX96.toString());
console.log('\nTransaction target:', poolManager);
console.log('Transaction data:', data);

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });
if (!(await publicClient.getBytecode({ address: poolManager }))) throw new Error(`No code at PoolManager ${poolManager}`);
const privateKey = process.env.BASE_SEPOLIA_PRIVATE_KEY;
if (!privateKey || privateKey.startsWith('<')) {
  console.log('\nBASE_SEPOLIA_PRIVATE_KEY is not set; dry-run only.');
  process.exit(0);
}
const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });
const hash = await walletClient.sendTransaction({ account, to: poolManager, data, value: 0n });
console.log('tx:', hash);
console.log(`explorer: https://sepolia.basescan.org/tx/${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log('status:', receipt.status);
