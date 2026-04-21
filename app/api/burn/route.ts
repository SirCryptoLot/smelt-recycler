// app/api/burn/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { mintSmeltReward } from '../../../scripts/mint-smelt';
import { currentSmeltPerAccount } from '../../../lib/constants';
import { recordRecycle as recordLeaderboard } from '../../../lib/leaderboard';
import { recordRecycle as recordEcosystem } from '../../../lib/ecosystem';

// NFTs earn 2x the standard token-account SMELT reward
const NFT_SMELT_MULTIPLIER = 2;
const SOL_RECLAIMED_PER_NFT = 0.002 * 0.95;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { wallet: string; nftsBurned: number };
    const { wallet, nftsBurned } = body;

    if (!wallet || typeof nftsBurned !== 'number' || nftsBurned <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const smeltMinted = currentSmeltPerAccount() * NFT_SMELT_MULTIPLIER * nftsBurned;
    const solReclaimed = SOL_RECLAIMED_PER_NFT * nftsBurned;

    // Record as recycled accounts so leaderboard/ecosystem stats stay consistent
    recordLeaderboard(wallet, nftsBurned, solReclaimed, smeltMinted);
    recordEcosystem(nftsBurned, solReclaimed, smeltMinted);

    // Mint SMELT — best-effort (activity already recorded above)
    let txSig: string | undefined;
    let mintError: string | undefined;
    try {
      // Pass accountCount * multiplier so mintSmeltReward mints the right amount
      txSig = await mintSmeltReward(new PublicKey(wallet), nftsBurned * NFT_SMELT_MULTIPLIER);
    } catch (err) {
      console.error('NFT burn SMELT mint failed:', err);
      mintError = err instanceof Error ? err.message : 'Mint failed';
    }

    return NextResponse.json({
      success: true,
      txSignature: txSig,
      smeltMinted: txSig ? smeltMinted : 0,
      ...(mintError ? { mintError } : {}),
    });
  } catch (err) {
    console.error('Burn record failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
