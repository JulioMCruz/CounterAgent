#!/usr/bin/env node
import { createPublicClient, formatUnits, http } from 'viem';
import { baseSepolia, erc20ReadAbi, loadCircleBaseSepoliaTokens, optionalAddress } from './lib.mjs';

const client = createPublicClient({ chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0]) });
const tokens = loadCircleBaseSepoliaTokens();
const wallet = optionalAddress('WALLET_ADDRESS');

console.log(`Network: ${baseSepolia.name} (${baseSepolia.id})`);
console.log(`RPC: ${baseSepolia.rpcUrls.default.http[0]}\n`);

for (const [label, address] of Object.entries(tokens)) {
  const bytecode = await client.getBytecode({ address });
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20ReadAbi, functionName: 'name' }),
    client.readContract({ address, abi: erc20ReadAbi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20ReadAbi, functionName: 'decimals' }),
  ]);
  console.log(`${label}`);
  console.log(`  address:  ${address}`);
  console.log(`  code:     ${bytecode ? 'yes' : 'no'}`);
  console.log(`  name:     ${name}`);
  console.log(`  symbol:   ${symbol}`);
  console.log(`  decimals: ${decimals}`);
  if (wallet) {
    const balance = await client.readContract({ address, abi: erc20ReadAbi, functionName: 'balanceOf', args: [wallet] });
    console.log(`  wallet:   ${wallet}`);
    console.log(`  balance:  ${formatUnits(balance, decimals)} ${symbol}`);
  }
  console.log('');
}
