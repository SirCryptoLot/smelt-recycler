// app/api/unstake/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { STAKING_POOL_ATA, SMELT_MINT, COOLDOWN_DAYS } from '../../../lib/constants';
import { MAINNET_RPC } from '../../../lib/solana';
import { requestUnstake, executeUnstake, loadPool } from '../../../lib/staking-pool';

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function verifyWalletSignature(wallet: string, message: string, signature: string): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubkeyBytes = new PublicKey(wallet).toBytes();
    return ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
  } catch {
    return false;
  }
}

// POST /api/unstake
// body: { action: 'request' | 'execute', wallet: string, signature: string, message: string }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { action, wallet, signature, message } = await req.json() as {
      action: 'request' | 'execute';
      wallet: string;
      signature: string;
      message: string;
    };

    if (!action || !wallet || !signature || !message) {
      return NextResponse.json({ error: 'action, wallet, signature, message required' }, { status: 400 });
    }

    // Verify the wallet signed the message (proves ownership without a tx)
    if (!verifyWalletSignature(wallet, message, signature)) {
      return NextResponse.json({ error: 'Invalid wallet signature' }, { status: 401 });
    }

    // Replay protection: message must contain recent timestamp (within 5 minutes)
    const parts = message.split(':');
    const ts = parseInt(parts[parts.length - 1] ?? '0', 10);
    if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Message timestamp expired' }, { status: 401 });
    }

    if (action === 'request') {
      const ok = requestUnstake(wallet);
      if (!ok) return NextResponse.json({ error: 'No active stake found' }, { status: 400 });

      const unlockAt = new Date(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
      return NextResponse.json({ success: true, cooldownDays: COOLDOWN_DAYS, unlockAt });
    }

    if (action === 'execute') {
      const smeltRaw = executeUnstake(wallet, COOLDOWN_DAYS);
      if (smeltRaw === 0n) {
        const state = loadPool();
        const record = state.stakes[wallet];
        if (!record?.cooldownStartedAt) {
          return NextResponse.json({ error: 'No unstake request found' }, { status: 400 });
        }
        const unlockAt = new Date(new Date(record.cooldownStartedAt).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
        return NextResponse.json({ error: `Cooldown not complete. Unlocks at ${unlockAt.toISOString()}` }, { status: 400 });
      }

      // Send SMELT back to user from staking pool
      const connection = new Connection(MAINNET_RPC, 'confirmed');
      const vaultKeypair = loadVaultKeypair();
      const recipientPubkey = new PublicKey(wallet);

      const recipientATA = await getAssociatedTokenAddress(
        SMELT_MINT,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction().add(
        createTransferCheckedInstruction(
          STAKING_POOL_ATA,
          SMELT_MINT,
          recipientATA,
          vaultKeypair.publicKey,
          smeltRaw,
          9, // SMELT decimals
          [],
          TOKEN_PROGRAM_ID,
        )
      );

      const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair], { commitment: 'confirmed' });

      return NextResponse.json({
        success: true,
        smeltReturned: smeltRaw.toString(),
        smeltReturnedUi: Number(smeltRaw) / 1e9,
        txSignature: sig,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    );
  }
}
