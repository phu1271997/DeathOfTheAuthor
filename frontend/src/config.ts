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
      url: 'https://genlayer-explorer.vercel.app',
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

export function getClient(account: string) {
  return createClient({
    chain: STUDIONET_CHAIN,
    endpoint: 'https://studio.genlayer.com/api',
    account: account as any,
  });
}
