// app/api/stake/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { STAKING_POOL_ATA, SMELT_MINT } from '../../../lib/constants';
import { MAINNET_RPC } from '../../../lib/solana';
import { addStake, loadPool } from '../../../lib/staking-pool';

// GET /api/stake?wallet=<pubkey>
export async function GET(req: NextRequest): Promise<NextResponse> {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  const state = loadPool();
  const record = state.stakes[wallet] ?? null;
  const totalSmelt = BigInt(state.totalSmeltStaked);
  const staked = record ? BigInt(record.smeltStaked) : 0n;
  const sharePct = totalSmelt > 0n ? Number(staked * 10000n / totalSmelt) / 100 : 0;

  return NextResponse.json({
    staked: staked.toString(),
    stakedUi: Number(staked) / 1e9,
    sharePct,
    depositedAt: record?.depositedAt ?? null,
    cooldownStartedAt: record?.cooldownStartedAt ?? null,
    epochStart: state.epochStart,
    totalSmeltStaked: state.totalSmeltStaked,
  });
}

// POST /api/stake  body: { txSignature: string, wallet: string }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { txSignature, wallet } = await req.json() as { txSignature: string; wallet: string };
    if (!txSignature || !wallet) {
      return NextResponse.json({ error: 'txSignature and wallet required' }, { status: 400 });
    }

    const connection = new Connection(MAINNET_RPC, 'confirmed');

    // Verify the transaction on-chain
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found or not confirmed' }, { status: 400 });
    }

    // Find the SPL token transfer instruction that sent SMELT to the staking ATA
    let smeltTransferred = 0n;
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      if (!('parsed' in ix)) continue;
      const p = ix.parsed as { type: string; info: { mint?: string; destination?: string; amount?: string; tokenAmount?: { amount: string } } };
      if (
        (p.type === 'transferChecked' || p.type === 'transfer') &&
        p.info.destination === STAKING_POOL_ATA.toBase58() &&
        (p.info.mint === SMELT_MINT.toBase58() || p.type === 'transfer')
      ) {
        const rawAmount = p.info.tokenAmount?.amount ?? p.info.amount ?? '0';
        smeltTransferred = BigInt(rawAmount);
        break;
      }
    }

    if (smeltTransferred === 0n) {
      return NextResponse.json({ error: 'No SMELT transfer to staking pool found in transaction' }, { status: 400 });
    }

    // Verify the sender matches the wallet claim
    const signer = tx.transaction.message.accountKeys[0];
    const signerPubkey = signer.pubkey.toBase58();
    if (signerPubkey !== wallet) {
      return NextResponse.json({ error: 'Transaction signer does not match wallet' }, { status: 400 });
    }

    const record = addStake(wallet, smeltTransferred);
    const state = loadPool();
    const totalSmelt = BigInt(state.totalSmeltStaked);
    const staked = BigInt(record.smeltStaked);
    const sharePct = totalSmelt > 0n ? Number(staked * 10000n / totalSmelt) / 100 : 0;

    return NextResponse.json({
      success: true,
      smeltStaked: record.smeltStaked,
      smeltStakedUi: Number(staked) / 1e9,
      sharePct,
      depositedAt: record.depositedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    );
  }
}
