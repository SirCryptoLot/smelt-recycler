// app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  VAULT_PUBKEY,
  SMELT_MINT,
  LIQUIDATION_THRESHOLD_USD,
  currentSmeltPerAccount,
} from '@/lib/constants';
import { MAINNET_RPC } from '@/lib/solana';
import { DATA_DIR } from '@/lib/paths';

interface LiquidationEntry {
  date: string; mint: string; amountIn: number;
  solReceived: number; txSignature: string; distributed: boolean;
}
interface DistributionEntry {
  date: string; totalSol: number; recipientCount: number; txSignatures: string[];
}
interface FeeEntry {
  date: string; wallet: string; accountsClosed: number; solFees: number; distributed: boolean;
}

function loadJson<T>(filepath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch { return fallback; }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const liquidations = loadJson<LiquidationEntry[]>(path.join(DATA_DIR, 'liquidations.json'), []);
  const distributions = loadJson<DistributionEntry[]>(path.join(DATA_DIR, 'distributions.json'), []);
  const fees = loadJson<FeeEntry[]>(path.join(DATA_DIR, 'fees.json'), []);

  // File-based stats
  const undistributedLiqSol = liquidations.filter((l) => !l.distributed).reduce((s, l) => s + l.solReceived, 0);
  const undistributedFeeSol = fees.filter((f) => !f.distributed).reduce((s, f) => s + f.solFees, 0);
  const totalAccountsClosed = fees.reduce((s, f) => s + f.accountsClosed, 0);
  const totalFeeSol = fees.reduce((s, f) => s + f.solFees, 0);
  const totalSolDistributed = distributions.reduce((s, d) => s + d.totalSol, 0);
  const lastDistribution = [...distributions].reverse().find(Boolean) ?? null;
  const pendingSol = undistributedLiqSol + undistributedFeeSol;

  let nextDistributionDate: string | null = null;
  if (lastDistribution) {
    const d = new Date(lastDistribution.date);
    d.setDate(d.getDate() + 7);
    nextDistributionDate = d.toISOString();
  }


  // Chain data
  const connection = new Connection(MAINNET_RPC, 'confirmed');

  let smeltSupply = 0;
  try {
    const s = await connection.getTokenSupply(SMELT_MINT);
    smeltSupply = s.value.uiAmount ?? 0;
  } catch { /* use 0 */ }

  let vaultTokens: Array<{ mint: string; uiAmount: number; usdValue: number; pctOfThreshold: number }> = [];
  let vaultTotalUsd = 0;
  try {
    const [legacy, t22] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const tokens = [...legacy.value, ...t22.value]
      .map((a) => {
        const info = a.account.data.parsed.info as {
          mint: string; tokenAmount: { uiAmount: number | null };
        };
        return { mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0 };
      })
      .filter((t) => t.uiAmount > 0);

    let prices: Record<string, number> = {};
    if (tokens.length > 0) {
      const mints = tokens.map((t) => t.mint).join(',');
      try {
        const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json() as { data: Record<string, { price: number }> };
          prices = Object.fromEntries(Object.entries(json.data).map(([m, d]) => [m, d.price]));
        }
      } catch { /* use zero prices */ }
    }

    vaultTokens = tokens.map((t) => {
      const usdValue = t.uiAmount * (prices[t.mint] ?? 0);
      vaultTotalUsd += usdValue;
      return {
        mint: t.mint,
        uiAmount: t.uiAmount,
        usdValue,
        pctOfThreshold: Math.min(100, (usdValue / LIQUIDATION_THRESHOLD_USD) * 100),
      };
    });
  } catch { /* use empty vault */ }

  const nav = smeltSupply > 0 ? pendingSol / smeltSupply : 0;

  return NextResponse.json({
    vault: { tokens: vaultTokens, totalUsd: vaultTotalUsd },
    smelt: {
      supply: smeltSupply,
      epochRate: currentSmeltPerAccount(),
      nav,
    },
    fees: {
      totalCollected: totalFeeSol,
      undistributedSol: undistributedFeeSol,
      totalAccountsClosed,
    },
    liquidations: {
      recent: liquidations.slice(-10).reverse(),
      undistributedSol: undistributedLiqSol,
    },
    distributions: {
      recent: distributions.slice(-10).reverse(),
      totalSolDistributed,
      lastDistribution,
      nextDistributionDate,
    },
    pending: { totalSol: pendingSol },
  });
}
