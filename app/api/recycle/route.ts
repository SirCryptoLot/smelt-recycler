// app/api/recycle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { mintSmeltReward } from '../../../scripts/mint-smelt';
import { currentSmeltPerAccount } from '../../../lib/constants';

const FEES_PATH = path.join(process.cwd(), 'data/fees.json');
const SOL_FEE_PER_ACCOUNT = 0.002 * 0.05; // 5% of 0.002 SOL rent

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
  } catch {
    // Non-blocking — fee logging failure never breaks minting
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, accountsClosed } = await req.json() as {
      wallet: string;
      accountsClosed: number;
    };

    if (!wallet || typeof accountsClosed !== 'number' || accountsClosed <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const recipient = new PublicKey(wallet);
    const txSig = await mintSmeltReward(recipient, accountsClosed);
    const smeltMinted = currentSmeltPerAccount() * accountsClosed;

    // Log the platform fee for this recycle batch
    appendFee({
      date: new Date().toISOString(),
      wallet,
      accountsClosed,
      solFees: SOL_FEE_PER_ACCOUNT * accountsClosed,
      distributed: false,
    });

    return NextResponse.json({ success: true, txSignature: txSig, smeltMinted });
  } catch (err) {
    console.error('Mint failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Mint failed' },
      { status: 500 },
    );
  }
}
