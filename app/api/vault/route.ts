// app/api/vault/route.ts
import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { VAULT_PUBKEY, LIQUIDATION_THRESHOLD_USD } from '@/lib/constants';
import { MAINNET_RPC } from '@/lib/solana';

interface VaultToken {
  mint: string;
  uiAmount: number;
  usdValue: number;
  pctOfThreshold: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    const connection = new Connection(MAINNET_RPC, 'confirmed');

    const [legacy, t22] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const accounts = [...legacy.value, ...t22.value];

    const tokens = accounts
      .map((a) => {
        const info = a.account.data.parsed.info as {
          mint: string;
          tokenAmount: { uiAmount: number | null; amount: string };
        };
        return {
          mint: info.mint,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        };
      })
      .filter((t) => t.uiAmount > 0);

    let prices: Record<string, number> = {};
    if (tokens.length > 0) {
      const mints = tokens.map((t) => t.mint).join(',');
      try {
        const res = await fetch(`https://api.jup.ag/price/v2?ids=${mints}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json() as { data: Record<string, { price: string } | null> };
          prices = Object.fromEntries(
            Object.entries(json.data)
              .filter(([, d]) => d !== null)
              .map(([mint, d]) => [mint, parseFloat((d as { price: string }).price) || 0])
          );
        }
      } catch { /* use zero prices */ }
    }

    const result: VaultToken[] = tokens.map((t) => {
      const usdValue = t.uiAmount * (prices[t.mint] ?? 0);
      return {
        mint: t.mint,
        uiAmount: t.uiAmount,
        usdValue,
        pctOfThreshold: Math.min(100, (usdValue / LIQUIDATION_THRESHOLD_USD) * 100),
      };
    });

    return NextResponse.json({ tokens: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch vault' },
      { status: 500 }
    );
  }
}
