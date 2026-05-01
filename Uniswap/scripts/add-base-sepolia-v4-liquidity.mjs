#!/usr/bin/env node
import { createRequire } from 'node:module';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, erc20ReadAbi, loadCircleBaseSepoliaTokens, requiredAddress } from './lib.mjs';

const require = createRequire(import.meta.url);
const { Pool, Position, V4PositionManager } = require('@uniswap/v4-sdk');
const { Percent, Token } = require('@uniswap/sdk-core');

const PERMIT2 = requiredAddress('PERMIT2_84532', '0x000000000022D473030F116dDEE9F6B43aC78BA3');
const V4_POSITION_MANAGER = requiredAddress('V4_POSITION_MANAGER_84532', '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80');
const tokens = loadCircleBaseSepoliaTokens();
const fee = Number(process.env.V4_POOL_FEE || 500);
const tickSpacing = Number(process.env.V4_TICK_SPACING || 10);
const tickLower = Number(process.env.V4_TICK_LOWER || -600);
const tickUpper = Number(process.env.V4_TICK_UPPER || 600);
const hook = getAddress(process.env.V4_HOOKS_84532 || process.env.V4_HOOKS || '0x0000000000000000000000000000000000000000');
const amountUsdc = process.env.LIQUIDITY_USDC || '45';
const amountEurc = process.env.LIQUIDITY_EURC || '45';
const recipient = getAddress(process.env.LIQUIDITY_RECIPIENT || process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000');
const deadline = Math.floor(Date.now() / 1000) + Number(process.env.DEADLINE_SECONDS || 1800);
const slippageBps = Number(process.env.SLIPPAGE_BPS || 50);
const initialSqrtPriceX96 = process.env.SQRT_PRICE_X96 || '79228162514264337593543950336';
const currentTick = Number(process.env.CURRENT_TICK || 0);

const erc20WriteAbi = parseAbi([
  'function approve(address spender,uint256 amount) external returns (bool)',
  'function allowance(address owner,address spender) external view returns (uint256)',
]);
const permit2Abi = parseAbi([
  'function approve(address token,address spender,uint160 amount,uint48 expiration) external',
  'function allowance(address owner,address token,address spender) external view returns (uint160 amount,uint48 expiration,uint48 nonce)',
]);
const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)',
]);

function orderedTokenData() {
  const usdc = getAddress(tokens.USDC);
  const eurc = getAddress(tokens.EURC);
  const usdcRaw = parseUnits(amountUsdc, 6);
  const eurcRaw = parseUnits(amountEurc, 6);
  if (BigInt(usdc) < BigInt(eurc)) {
    return {
      currency0: new Token(baseSepolia.id, usdc, 6, 'USDC', 'USDC'),
      currency1: new Token(baseSepolia.id, eurc, 6, 'EURC', 'EURC'),
      amount0: usdcRaw,
      amount1: eurcRaw,
    };
  }
  return {
    currency0: new Token(baseSepolia.id, eurc, 6, 'EURC', 'EURC'),
    currency1: new Token(baseSepolia.id, usdc, 6, 'USDC', 'USDC'),
    amount0: eurcRaw,
    amount1: usdcRaw,
  };
}

const privateKey = process.env.BASE_SEPOLIA_PRIVATE_KEY;
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });
const { currency0, currency1, amount0, amount1 } = orderedTokenData();

console.log('Uniswap v4 Base Sepolia add liquidity');
console.log('PositionManager:', V4_POSITION_MANAGER);
console.log('Permit2:', PERMIT2);
console.log('PoolKey:', { currency0: currency0.address, currency1: currency1.address, fee, tickSpacing, hooks: hook });
console.log('ticks:', tickLower, tickUpper);
console.log('amount desired:', `${formatUnits(amount0, 6)} ${currency0.symbol}`, '+', `${formatUnits(amount1, 6)} ${currency1.symbol}`);
console.log('recipient:', recipient);

let poolSqrtPriceX96 = initialSqrtPriceX96;
let poolCurrentTick = currentTick;
if (!process.env.SQRT_PRICE_X96 || !process.env.CURRENT_TICK) {
  const stateView = requiredAddress('V4_STATE_VIEW_84532', '0x571291b572ed32ce6751a2cb2486ebee8defb9b4');
  const poolId = Pool.getPoolId(currency0, currency1, fee, tickSpacing, hook);
  const [sqrtPriceX96, tick] = await publicClient.readContract({
    address: stateView,
    abi: stateViewAbi,
    functionName: 'getSlot0',
    args: [poolId],
  });
  if (sqrtPriceX96 > 0n) {
    poolSqrtPriceX96 = sqrtPriceX96.toString();
    poolCurrentTick = Number(tick);
    console.log('current pool tick:', poolCurrentTick);
  }
}

const pool = new Pool(currency0, currency1, fee, tickSpacing, hook, poolSqrtPriceX96, 0, poolCurrentTick);
const position = Position.fromAmounts({ pool, tickLower, tickUpper, amount0: amount0.toString(), amount1: amount1.toString(), useFullPrecision: true });
const { calldata, value } = V4PositionManager.addCallParameters(position, {
  recipient,
  slippageTolerance: new Percent(slippageBps, 10_000),
  deadline: deadline.toString(),
  hookData: '0x',
});

const approveCalldata = [
  { label: `approve ${currency0.symbol} -> Permit2`, to: currency0.address, data: encodeFunctionData({ abi: erc20WriteAbi, functionName: 'approve', args: [PERMIT2, amount0] }) },
  { label: `approve ${currency1.symbol} -> Permit2`, to: currency1.address, data: encodeFunctionData({ abi: erc20WriteAbi, functionName: 'approve', args: [PERMIT2, amount1] }) },
  { label: `Permit2 approve ${currency0.symbol} -> PositionManager`, to: PERMIT2, data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [currency0.address, V4_POSITION_MANAGER, amount0, deadline] }) },
  { label: `Permit2 approve ${currency1.symbol} -> PositionManager`, to: PERMIT2, data: encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [currency1.address, V4_POSITION_MANAGER, amount1, deadline] }) },
  { label: 'PositionManager modifyLiquidities mint', to: V4_POSITION_MANAGER, data: calldata, value: BigInt(value) },
];

if (!privateKey || privateKey.startsWith('<')) {
  console.log('\nBASE_SEPOLIA_PRIVATE_KEY is not set; dry-run calldata only.');
  for (const tx of approveCalldata) {
    console.log(`\n# ${tx.label}`);
    console.log('to:', tx.to);
    console.log('value:', tx.value?.toString() ?? '0');
    console.log('data:', tx.data);
  }
  process.exit(0);
}

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
if (recipient.toLowerCase() === '0x0000000000000000000000000000000000000000') {
  throw new Error('Set LIQUIDITY_RECIPIENT or WALLET_ADDRESS before sending transactions.');
}
console.log('\nsender:', account.address);
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });

let nextNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
async function send(label, to, data, value = 0n) {
  console.log(`\nSending: ${label}`);
  const hash = await walletClient.sendTransaction({ account, to, data, value, nonce: nextNonce++ });
  console.log('tx:', hash);
  console.log(`explorer: https://sepolia.basescan.org/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('status:', receipt.status);
  if (receipt.status !== 'success') throw new Error(`${label} failed`);
}

for (const token of [currency0, currency1]) {
  const [symbol, decimals, balance] = await Promise.all([
    publicClient.readContract({ address: token.address, abi: erc20ReadAbi, functionName: 'symbol' }),
    publicClient.readContract({ address: token.address, abi: erc20ReadAbi, functionName: 'decimals' }),
    publicClient.readContract({ address: token.address, abi: erc20ReadAbi, functionName: 'balanceOf', args: [account.address] }),
  ]);
  console.log(`${symbol} balance:`, formatUnits(balance, decimals));
}

for (const tx of approveCalldata) {
  await send(tx.label, tx.to, tx.data, tx.value ?? 0n);
}

console.log('\nDone. v4 liquidity mint submitted.');
