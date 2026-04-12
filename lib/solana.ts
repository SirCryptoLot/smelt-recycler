// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const MAINNET_RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';

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
  state: string;  // 'initialized' | 'frozen' | 'uninitialized'
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

export interface TokenMeta {
  name: string;
  symbol: string;
}

// Uses Helius DAS getAssetBatch — covers all on-chain tokens, not just Jupiter-listed ones.
export async function fetchTokenMetas(mints: string[]): Promise<Record<string, TokenMeta>> {
  if (mints.length === 0) return {};
  try {
    const res = await fetch(MAINNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'fetch-metas',
        method: 'getAssetBatch',
        params: { ids: mints },
      }),
    });
    if (!res.ok) return {};
    const json = await res.json() as {
      result: Array<{
        id: string;
        content?: { metadata?: { name?: string; symbol?: string } };
      } | null>;
    };
    const result: Record<string, TokenMeta> = {};
    for (const asset of json.result ?? []) {
      if (!asset) continue;
      const meta = asset.content?.metadata;
      if (meta?.name || meta?.symbol) {
        result[asset.id] = { name: meta.name ?? '', symbol: meta.symbol ?? '' };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export async function getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]> {
  const { value: accounts } = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    { programId: TOKEN_PROGRAM_ID }
  );

  // Skip frozen accounts — they can't be transferred or closed
  const eligible = accounts.filter((a) => {
    const info = a.account.data.parsed.info as ParsedTokenInfo;
    return info.state !== 'frozen';
  });

  if (eligible.length === 0) return [];

  // Fetch prices only for accounts that actually hold tokens
  const withBalance = eligible.filter((a) => {
    const info = a.account.data.parsed.info as ParsedTokenInfo;
    return (info.tokenAmount.uiAmount ?? 0) > 0;
  });
  const mints = withBalance.map((a) => a.account.data.parsed.info.mint as string);
  const prices = mints.length > 0 ? await fetchPrices(mints) : {};

  return eligible
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
    // Include empty accounts (usdValue=0) and dust accounts (usdValue<$0.10)
    .filter((a) => a.usdValue < 0.10);
}
