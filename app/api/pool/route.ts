// app/api/pool/route.ts
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { VAULT_PUBKEY, DISTRIBUTION_EPOCH_MS } from '../../../lib/constants';
import { MAINNET_RPC } from '../../../lib/solana';
import { loadPool } from '../../../lib/staking-pool';
import { DATA_DIR } from '../../../lib/paths';

const DISTRIBUTIONS_PATH = path.join(DATA_DIR, 'distributions.json');
const VAULT_RESERVE_SOL = 0.01;

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
}

function loadDistributions(): DistributionEntry[] {
  try {
    if (!fs.existsSync(DISTRIBUTIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(DISTRIBUTIONS_PATH, 'utf-8')) as DistributionEntry[];
  } catch {
    return [];
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const state = loadPool();
    const distributions = loadDistributions();

    const connection = new Connection(MAINNET_RPC, 'confirmed');
    let vaultSolBalance = 0;
    try {
      const lamports = await connection.getBalance(VAULT_PUBKEY);
      vaultSolBalance = lamports / LAMPORTS_PER_SOL;
    } catch {
      // non-fatal — return 0 if RPC fails
    }

    const distributableSol = Math.max(0, vaultSolBalance - VAULT_RESERVE_SOL);
    const epochStartMs = new Date(state.epochStart).getTime();
    const nextDistributionAt = new Date(epochStartMs + DISTRIBUTION_EPOCH_MS).toISOString();

    const last10 = [...distributions]
      .reverse()
      .slice(0, 10)
      .map(({ date, totalSol, recipientCount }) => ({ date, totalSol, recipientCount }));

    return NextResponse.json({
      totalSmeltStaked: state.totalSmeltStaked,
      totalSmeltStakedUi: Number(BigInt(state.totalSmeltStaked) / 1_000_000_000n)
        + Number(BigInt(state.totalSmeltStaked) % 1_000_000_000n) / 1e9,
      stakerCount: Object.keys(state.stakes).length,
      epochStart: state.epochStart,
      nextDistributionAt,
      vaultSolBalance,
      distributableSol,
      distributions: last10,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
