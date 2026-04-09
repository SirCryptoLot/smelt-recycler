// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

export const connection = new Connection(MAINNET_RPC, 'confirmed');

export interface TrashAccount {
  pubkey: PublicKey;
  mint: PublicKey;
  balance: number;        // UI amount (decimals applied)
  usdValue: number;       // balance × pricePerToken
  pricePerToken: number;  // 0 if unlisted
}

export async function getTrashAccounts(_walletAddress: PublicKey): Promise<TrashAccount[]> {
  return [];
}
