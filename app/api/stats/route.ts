// app/api/stats/route.ts
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../../../lib/paths';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

interface FeeEntry {
  date: string;
  wallet: string;
  accountsClosed: number;
  solFees: number;
  distributed: boolean;
}

function loadJson<T>(filepath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function GET(): Promise<NextResponse> {
  const LIQUIDATIONS_PATH = path.join(DATA_DIR, 'liquidations.json');
  const DISTRIBUTIONS_PATH = path.join(DATA_DIR, 'distributions.json');
  const FEES_PATH = path.join(DATA_DIR, 'fees.json');

  const liquidations = loadJson<LiquidationEntry[]>(LIQUIDATIONS_PATH, []);
  const distributions = loadJson<DistributionEntry[]>(DISTRIBUTIONS_PATH, []);
  const fees = loadJson<FeeEntry[]>(FEES_PATH, []);

  const totalSolDistributed = distributions.reduce((s, d) => s + d.totalSol, 0);
  const lastDistribution = [...distributions].reverse().find(Boolean) ?? null;

  const undistributedLiquidationSol = liquidations
    .filter((l) => !l.distributed)
    .reduce((s, l) => s + l.solReceived, 0);
  const totalLiqSolReceived = liquidations.reduce((s, l) => s + l.solReceived, 0);

  const undistributedFeeSol = fees
    .filter((f) => !f.distributed)
    .reduce((s, f) => s + f.solFees, 0);

  const totalAccountsClosed = fees.reduce((s, f) => s + f.accountsClosed, 0);
  const totalFeeSolCollected = fees.reduce((s, f) => s + f.solFees, 0);

  let nextDistributionDate: string | null = null;
  if (lastDistribution) {
    const last = new Date(lastDistribution.date);
    last.setDate(last.getDate() + 7);
    nextDistributionDate = last.toISOString();
  }

  return NextResponse.json({
    liquidations: {
      recent: liquidations.slice(-5).reverse(),
      undistributedSol: undistributedLiquidationSol,
      totalSolReceived: totalLiqSolReceived,
    },
    fees: {
      undistributedSol: undistributedFeeSol,
      totalCollected: totalFeeSolCollected,
      totalAccountsClosed,
    },
    distributions: {
      totalSolDistributed,
      lastDistribution,
      nextDistributionDate,
    },
  });
}
