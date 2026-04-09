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

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    chunk(mints, 50).map(async (c) => {
      const res = await fetch(`https://price.jup.ag/v4/price?ids=${c.join(',')}`);
      if (!res.ok) throw new Error(`Jupiter API error: ${res.status}`);
      const json = await res.json() as { data: Record<string, { price: number }> };
      const prices: Record<string, number> = {};
      for (const [mint, info] of Object.entries(json.data)) {
        prices[mint] = info.price;
      }
      return prices;
    })
  );
  return Object.assign({}, ...results) as Record<string, number>;
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

  const mints = nonEmpty.map((a) => a.account.data.parsed.info.mint as string);
  const prices = await fetchPrices(mints);

  return nonEmpty
    .map((a) => {
      const info = a.account.data.parsed.info;
      const mintStr = info.mint as string;
      const balance = info.tokenAmount.uiAmount as number;
      const pricePerToken = prices[mintStr] ?? 0;
      return {
        pubkey: a.pubkey,
        mint: new PublicKey(mintStr),
        balance,
        usdValue: balance * pricePerToken,
        pricePerToken,
      };
    })
    .filter((a) => a.usdValue < 0.10);
}
