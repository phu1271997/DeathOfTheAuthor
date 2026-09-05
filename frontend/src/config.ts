declare global {
  interface Window {
    ethereum?: any;
  }
}

import { createClient } from 'genlayer-js';

export const CONTRACT_ADDRESS = (import.meta as any).env?.VITE_CONTRACT_ADDRESS || '';

const STUDIONET_CHAIN = {
  id: 61999,
  name: 'Genlayer Studio Network',
  rpcUrls: {
    default: {
      http: ['https://studio.genlayer.com/api'] as const,
    },
  },
  nativeCurrency: {
    name: 'GEN Token',
    symbol: 'GEN',
    decimals: 18,
  },
  blockExplorers: {
    default: {
      name: 'GenLayer Explorer',
      url: 'https://explorer-studio.genlayer.com',
    },
  },
};

const CHAIN_ID_HEX = '0x' + STUDIONET_CHAIN.id.toString(16);

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error('MetaMask not found. Please install MetaMask.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err.code === 4902 || err.code === -32603) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: STUDIONET_CHAIN.name,
          nativeCurrency: STUDIONET_CHAIN.nativeCurrency,
          rpcUrls: [...STUDIONET_CHAIN.rpcUrls.default.http],
          blockExplorerUrls: [STUDIONET_CHAIN.blockExplorers.default.url],
        }],
      });
    } else {
      throw err;
    }
  }

  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });

  return accounts[0];
}

export function getClient(account?: string) {
  const opts: any = {
    chain: STUDIONET_CHAIN,
    endpoint: 'https://studio.genlayer.com/api',
  };
  if (account) {
    opts.account = account as any;
  }
  return createClient(opts);
}

export function getReadClient() {
  return createClient({
    chain: STUDIONET_CHAIN,
    endpoint: 'https://studio.genlayer.com/api',
    account: null as any,
  });
}

const WEI_PER_GEN = 1_000_000_000_000_000_000n;

export function genToWei(gen: string | number): bigint {
  const s = String(gen).trim();
  if (!s || isNaN(Number(s))) return 0n;
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '000000000000000000').slice(0, 18);
  return BigInt(whole || '0') * WEI_PER_GEN + BigInt(fracPadded || '0');
}

export function weiToGen(wei: string | number | bigint): string {
  try {
    const w = typeof wei === 'bigint' ? wei : BigInt(String(wei || '0'));
    if (w === 0n) return '0';
    const whole = w / WEI_PER_GEN;
    const frac = w % WEI_PER_GEN;
    if (frac === 0n) return whole.toLocaleString('en-US');
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 4);
    return whole.toLocaleString('en-US') + (fracStr ? '.' + fracStr : '');
  } catch {
    return '0';
  }
}
