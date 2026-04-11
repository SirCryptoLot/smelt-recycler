// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const MAINNET_RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';

export const connection = new Connection(MAINNET_RPC, 'confirmed');

export interface TrashAccount {
  pubkey: PublicKey;
  mint: PublicKey;
  balance: number;        // UI amount (decimals applied)
  usdValue: number;       // balance × pricePerToken
  pricePerToken: number;  // 0 if unlisted
  rawAmount: bigint;      // exact token amount for transferChecked
  decimals: number;       // mint decimals for transferChecked
}

interface ParsedTokenInfo {
  mint: string;
  tokenAmount: {
    uiAmount: number | null;
    amount: string;    // raw integer as decimal string e.g. "142000000000"
    decimals: number;
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    chunk(mints, 50).map(async (c) => {
      try {
        const res = await fetch(`https://api.jup.ag/price/v2?ids=${c.join(',')}`);
        if (!res.ok) return {};
        const json = await res.json() as { data: Record<string, { price: string }> };
        const prices: Record<string, number> = {};
        for (const [mint, info] of Object.entries(json.data ?? {})) {
          prices[mint] = parseFloat(info.price) || 0;
        }
        return prices;
      } catch {
        return {};
      }
    })
  );
  return Object.assign({}, ...results);
}

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export async function getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]> {
  const { value: accounts } = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    { programId: TOKEN_PROGRAM_ID }
  );

  const nonEmpty = accounts.filter((a) => {
    const info = a.account.data.parsed.info as ParsedTokenInfo;
    return info.tokenAmount.uiAmount !== null && info.tokenAmount.uiAmount > 0;
  });

  if (nonEmpty.length === 0) return [];

  const mints = nonEmpty.map((a) => a.account.data.parsed.info.mint as string);
  const prices = await fetchPrices(mints);

  return nonEmpty
    .map((a) => {
      const info = a.account.data.parsed.info as ParsedTokenInfo;
      const mintStr = info.mint;
      const balance = info.tokenAmount.uiAmount ?? 0;
      const pricePerToken = prices[mintStr] ?? 0;
      return {
        pubkey: a.pubkey,
        mint: new PublicKey(mintStr),
        balance,
        usdValue: balance * pricePerToken,
        pricePerToken,
        rawAmount: BigInt(info.tokenAmount.amount ?? '0'),
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter((a) => a.usdValue < 0.10);
}
