// app/api/admin/cron/route.ts
// Called every 2 days by an external cron (cron-job.org / Railway).
// 1. Liquidates ALL vault tokens → SOL via Jupiter (no USD threshold).
// 2. Distributes accumulated SOL (liquidations + fees + donations) to pool stakers.
// Uses VAULT_KEYPAIR for both operations — the SOL lives in the vault wallet.
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { swapToSol } from '../../../../lib/jupiter';
import { VAULT_PUBKEY } from '../../../../lib/constants';
import { MAINNET_RPC } from '../../../../lib/solana';
import { DATA_DIR } from '../../../../lib/paths';
import { loadPool, getEpochEligibleStakes, savePool } from '../../../../lib/staking-pool';
import { getLeaderboard, resetWeeklyLeaderboard } from '../../../../lib/leaderboard';

export const dynamic = 'force-dynamic';

const DISTRIBUTIONS_PATH = path.join(DATA_DIR, 'distributions.json');
const TRANSFERS_PER_TX = 18; // leave headroom under 20 instruction limit

// ── Types ────────────────────────────────────────────────────────────────────

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
  liquidationSol: number;
  feeSol: number;
  donationSol: number;
  txSignatures: string[];
}

// ── Keypair loaders ───────────────────────────────────────────────────────────

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function loadJson<T>(p: string): T[] {
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as T[]; } catch { return []; }
}

function saveJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ── Vault token balances ──────────────────────────────────────────────────────

async function fetchVaultTokens(
  connection: Connection,
): Promise<Array<{ mint: string; rawAmount: number }>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
    programId: TOKEN_PROGRAM_ID,
  });
  return accounts.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { amount: string; uiAmount: number | null };
      };
      return { mint: info.mint, rawAmount: parseInt(info.tokenAmount.amount, 10) };
    })
    .filter((a) => a.rawAmount > 0);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];
  const ts = () => new Date().toISOString();

  try {
    const connection = new Connection(MAINNET_RPC, 'confirmed');
    const vaultKeypair = loadVaultKeypair();

    log.push(`[${ts()}] Cron started. Vault: ${VAULT_PUBKEY.toBase58()}`);

    // ── Phase 0: Weekly leaderboard reset ────────────────────────────────────

    const leaderboard = getLeaderboard();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const lastReset = new Date(leaderboard.weekly.since).getTime();
    if (Date.now() - lastReset >= weekMs) {
      resetWeeklyLeaderboard();
      log.push(`[${ts()}] Weekly leaderboard reset.`);
    } else {
      const msUntilReset = weekMs - (Date.now() - lastReset);
      const hoursLeft = Math.ceil(msUntilReset / 3_600_000);
      log.push(`[${ts()}] Weekly leaderboard: ${hoursLeft}h until next reset.`);
    }

    // ── Phase 1: Liquidate ALL vault tokens ──────────────────────────────────

    log.push(`[${ts()}] Phase 1: liquidation`);
    const tokens = await fetchVaultTokens(connection);
    log.push(`  ${tokens.length} token(s) in vault`);

    let newLiquidationSol = 0;

    for (const token of tokens) {
      log.push(`  Swapping ${token.mint.slice(0, 8)}... (${token.rawAmount} raw)`);
      try {
        const result = await swapToSol(connection, vaultKeypair, token.mint, token.rawAmount);
        log.push(`    ✓ ${result.solReceived.toFixed(6)} SOL  tx: ${result.txSignature.slice(0, 16)}...`);
        newLiquidationSol += result.solReceived;
      } catch (err) {
        log.push(`    ✗ swap failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log.push(`  New SOL from liquidations: ${newLiquidationSol.toFixed(6)}`);

    // ── Phase 2: Use vault's actual on-chain balance as source of truth ──────
    // Railway's filesystem is ephemeral — JSON files reset on redeploy.
    // We use vault balance directly; JSON files are only for audit/marking.

    log.push(`[${ts()}] Phase 2: vault balance`);

    const VAULT_RESERVE_SOL = 0.01; // keep for rent + future tx fees
    const vaultBalanceLamports = await connection.getBalance(vaultKeypair.publicKey);
    const vaultBalance = vaultBalanceLamports / LAMPORTS_PER_SOL;
    const distributableSol = Math.max(0, vaultBalance - VAULT_RESERVE_SOL);

    log.push(`  Vault balance: ${vaultBalance.toFixed(6)} SOL`);
    log.push(`  Reserve: ${VAULT_RESERVE_SOL} SOL`);
    log.push(`  Distributable: ${distributableSol.toFixed(6)} SOL`);

    if (distributableSol < 0.001) {
      log.push('  Less than 0.001 SOL above reserve — skipping distribution.');
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    // ── Phase 3: Load eligible pool stakers ──────────────────────────────────

    log.push(`[${ts()}] Phase 3: pool stakers`);
    const poolState = loadPool();
    const eligibleStakes = getEpochEligibleStakes(poolState);
    log.push(`  ${eligibleStakes.length} eligible staker(s) (staked before ${poolState.epochStart})`);

    if (eligibleStakes.length === 0) {
      log.push('  No eligible stakers — skipping distribution.');
      poolState.epochStart = new Date().toISOString();
      savePool(poolState);
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    const totalStaked = eligibleStakes.reduce((s, e) => s + e.smeltRaw, 0n);
    if (totalStaked === 0n) {
      log.push('  Total staked is 0 — skipping.');
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    // ── Phase 4: Distribute proportionally to stakers ────────────────────────

    log.push(`[${ts()}] Phase 4: distribution`);

    const RENT_EXEMPT_MIN = await connection.getMinimumBalanceForRentExemption(0);
    const totalLamports = Math.floor(distributableSol * LAMPORTS_PER_SOL);

    const recipients: Array<{ address: PublicKey; lamports: number }> = [];
    for (const { wallet, smeltRaw } of eligibleStakes) {
      const share = Number(smeltRaw * BigInt(totalLamports) / totalStaked);
      if (share >= RENT_EXEMPT_MIN) {
        recipients.push({ address: new PublicKey(wallet), lamports: share });
      }
    }

    log.push(`  Distributing to ${recipients.length} recipient(s) in batches of ${TRANSFERS_PER_TX}`);

    const txSignatures: string[] = [];
    for (let i = 0; i < recipients.length; i += TRANSFERS_PER_TX) {
      const batch = recipients.slice(i, i + TRANSFERS_PER_TX);
      const tx = new Transaction();
      for (const { address, lamports } of batch) {
        tx.add(SystemProgram.transfer({
          fromPubkey: vaultKeypair.publicKey, // vault holds the SOL
          toPubkey: address,
          lamports,
        }));
      }
      try {
        const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair], {
          commitment: 'confirmed',
        });
        txSignatures.push(sig);
        const batchNum = Math.floor(i / TRANSFERS_PER_TX) + 1;
        const totalBatches = Math.ceil(recipients.length / TRANSFERS_PER_TX);
        log.push(`  ✓ Batch ${batchNum}/${totalBatches}  tx: ${sig.slice(0, 16)}...`);
      } catch (err) {
        log.push(`  ✗ batch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Phase 5: Record distribution (JSON files are audit-only on Railway) ───

    const distributions = loadJson<DistributionEntry>(DISTRIBUTIONS_PATH);
    distributions.push({
      date: ts(),
      totalSol: distributableSol,
      liquidationSol: 0,
      feeSol: 0,
      donationSol: 0,
      recipientCount: recipients.length,
      txSignatures,
    });
    saveJson(DISTRIBUTIONS_PATH, distributions);

    // Advance epoch start so current stakers become eligible next cycle
    poolState.epochStart = new Date().toISOString();
    savePool(poolState);

    log.push(`[${ts()}] Done. ${txSignatures.length} distribution tx(s) sent.`);

    return NextResponse.json({
      ok: true,
      liquidated: tokens.length,
      distributed: recipients.length,
      totalSol: distributableSol,
      txSignatures,
      log,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`[${ts()}] FATAL: ${msg}`);
    console.error('Cron error:', err);
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 });
  }
}
