declare global {
  interface Window {
    ethereum?: any;
  }
}

import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

const CHAIN_ID_HEX = '0x' + studionet.id.toString(16);

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
          chainName: 'Genlayer Studio Network',
          nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
          rpcUrls: ['https://studio.genlayer.com/api'],
          blockExplorerUrls: ['https://genlayer-explorer.vercel.app'],
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
  return createClient({ chain: studionet, account: account as `0x${string}` });
}
