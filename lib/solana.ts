// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';
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

export async function getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]> {
  const { value: accounts } = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    { programId: TOKEN_PROGRAM_ID }
  );

  const nonEmpty = accounts.filter(
    (a) => (a.account.data.parsed.info.tokenAmount.uiAmount as number) > 0
  );

  if (nonEmpty.length === 0) return [];

  // price fetching — next task
  return [];
}
