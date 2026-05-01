import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { getAddress, isAddress } from 'viem';

if (existsSync('.env')) dotenvConfig({ path: '.env' });
if (existsSync('../.env')) dotenvConfig({ path: '../.env' });

export const baseSepolia = {
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' } },
};

export function requiredAddress(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value || !isAddress(value)) throw new Error(`${name} is missing or invalid`);
  return getAddress(value);
}

export function optionalAddress(name) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!isAddress(value)) throw new Error(`${name} is invalid`);
  return getAddress(value);
}

export function loadCircleBaseSepoliaTokens() {
  return {
    USDC: requiredAddress('USDC_TOKEN_ADDRESS_84532', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
    EURC: requiredAddress('EURC_TOKEN_ADDRESS_84532', '0x808456652fdb597867f38412077A9182bf77359F'),
  };
}

export const erc20ReadAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];
