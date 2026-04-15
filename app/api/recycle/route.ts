// app/api/recycle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { mintSmeltReward } from '../../../scripts/mint-smelt';
import { currentSmeltPerAccount } from '../../../lib/constants';
import { recordRecycle as recordLeaderboard, getWalletStats } from '../../../lib/leaderboard';
import { recordReferral } from '../../../lib/referrals';
import { recordRecycle as recordEcosystem, incrementWalletCount } from '../../../lib/ecosystem';
import { appendDonation } from '../../../lib/donations';
import { DATA_DIR } from '../../../lib/paths';

const FEES_PATH = path.join(DATA_DIR, 'fees.json');
const SOL_FEE_PER_ACCOUNT = 0.002 * 0.05;
const SOL_RECLAIMED_PER_ACCOUNT = 0.002 * 0.95;

interface FeeEntry {
  date: string;
  wallet: string;
  accountsClosed: number;
  solFees: number;
  distributed: boolean;
}

function appendFee(entry: FeeEntry): void {
  try {
    const existing: FeeEntry[] = fs.existsSync(FEES_PATH)
      ? JSON.parse(fs.readFileSync(FEES_PATH, 'utf-8')) as FeeEntry[]
      : [];
    existing.push(entry);
    fs.writeFileSync(FEES_PATH, JSON.stringify(existing, null, 2));
  } catch { /* non-blocking */ }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      wallet: string;
      accountsClosed: number;
      referredBy?: string;
      solDonated?: number;
    };
    const { wallet, accountsClosed, referredBy, solDonated } = body;

    if (!wallet || typeof accountsClosed !== 'number' || accountsClosed <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const smeltMinted = currentSmeltPerAccount() * accountsClosed;
    const solReclaimed = SOL_RECLAIMED_PER_ACCOUNT * accountsClosed;

    // ── Record activity FIRST, regardless of mint outcome ──────────────
    appendFee({
      date: new Date().toISOString(),
      wallet,
      accountsClosed,
      solFees: SOL_FEE_PER_ACCOUNT * accountsClosed,
      distributed: false,
    });

    if (solDonated && solDonated > 0) {
      appendDonation({
        date: new Date().toISOString(),
        wallet,
        solDonated,
        pct: Math.round(solDonated / solReclaimed * 100),
        txSignature: '',
      });
    }

    const priorStats = getWalletStats(wallet);
    const isNewWallet = priorStats.allTime.accounts === 0;

    recordLeaderboard(wallet, accountsClosed, solReclaimed, smeltMinted);
    recordEcosystem(accountsClosed, solReclaimed, smeltMinted);
    if (isNewWallet) incrementWalletCount();

    if (referredBy && referredBy !== wallet) {
      try {
        new PublicKey(referredBy);
        recordReferral(referredBy, wallet, accountsClosed, solReclaimed);
      } catch { /* invalid pubkey */ }
    }

    // ── Mint SMELT — best-effort, failure does not block the record ─────
    try {
      const recipient = new PublicKey(wallet);
      const txSig = await mintSmeltReward(recipient, accountsClosed);
      return NextResponse.json({ success: true, txSignature: txSig, smeltMinted });
    } catch (mintErr) {
      console.error('SMELT mint failed (activity already recorded):', mintErr);
      return NextResponse.json({
        success: true,
        smeltMinted: 0,
        mintError: mintErr instanceof Error ? mintErr.message : 'Mint failed',
      });
    }
  } catch (err) {
    console.error('Recycle record failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
