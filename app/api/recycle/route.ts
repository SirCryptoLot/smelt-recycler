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

const FEES_PATH = path.join(process.cwd(), 'data/fees.json');
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

    const recipient = new PublicKey(wallet);
    const txSig = await mintSmeltReward(recipient, accountsClosed);
    const smeltMinted = currentSmeltPerAccount() * accountsClosed;
    const solReclaimed = SOL_RECLAIMED_PER_ACCOUNT * accountsClosed;

    // Fee log
    appendFee({
      date: new Date().toISOString(),
      wallet,
      accountsClosed,
      solFees: SOL_FEE_PER_ACCOUNT * accountsClosed,
      distributed: false,
    });

    // Donation log
    if (solDonated && solDonated > 0) {
      appendDonation({
        date: new Date().toISOString(),
        wallet,
        solDonated,
        pct: Math.round(solDonated / (SOL_RECLAIMED_PER_ACCOUNT * accountsClosed) * 100),
        txSignature: txSig,
      });
    }

    // Check if this is a new wallet (no prior all-time stats)
    const priorStats = getWalletStats(wallet);
    const isNewWallet = priorStats.allTime.accounts === 0;

    // Leaderboard + ecosystem
    recordLeaderboard(wallet, accountsClosed, solReclaimed, smeltMinted);
    recordEcosystem(accountsClosed, solReclaimed, smeltMinted);
    if (isNewWallet) incrementWalletCount();

    // Referral bonus
    if (referredBy && referredBy !== wallet) {
      try {
        new PublicKey(referredBy); // validate it's a real pubkey
        recordReferral(referredBy, wallet, accountsClosed, solReclaimed);
      } catch { /* invalid pubkey — silently ignore */ }
    }

    return NextResponse.json({ success: true, txSignature: txSig, smeltMinted });
  } catch (err) {
    console.error('Mint failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Mint failed' },
      { status: 500 },
    );
  }
}
