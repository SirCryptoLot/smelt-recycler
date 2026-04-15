// app/api/admin/cron/route.ts
// Called every 2 days by an external cron (cron-job.org / Railway).
// 1. Liquidates ALL vault tokens → SOL via Jupiter (no USD threshold).
// 2. Distributes accumulated SOL (liquidations + fees + donations) to SMELT holders.
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
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { swapToSol } from '../../../../lib/jupiter';
import { VAULT_PUBKEY, SMELT_MINT, STAKING_PROGRAM_ID, STAKING_BOOST } from '../../../../lib/constants';
import { MAINNET_RPC } from '../../../../lib/solana';
import { DATA_DIR } from '../../../../lib/paths';
import { loadDonations } from '../../../../lib/donations';

export const dynamic = 'force-dynamic';

const LIQUIDATIONS_PATH = path.join(DATA_DIR, 'liquidations.json');
const DISTRIBUTIONS_PATH = path.join(DATA_DIR, 'distributions.json');
const FEES_PATH = path.join(DATA_DIR, 'fees.json');
const DONATIONS_PATH = path.join(DATA_DIR, 'donations.json');
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

interface FeeEntry {
  date: string;
  wallet: string;
  accountsClosed: number;
  solFees: number;
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

interface StakeAccountData {
  owner: PublicKey;
  amountStaked: { toString(): string };
  bump: number;
}

// ── Keypair loaders ───────────────────────────────────────────────────────────

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadAdminKeypair(): Keypair {
  const raw = JSON.parse(process.env.ADMIN_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('ADMIN_KEYPAIR env var not set');
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

// ── SMELT holder snapshot ─────────────────────────────────────────────────────

async function fetchSmeltHolders(connection: Connection): Promise<Record<string, bigint>> {
  const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: SMELT_MINT.toBase58() } },
    ],
  });
  const holders: Record<string, bigint> = {};
  for (const acct of accounts) {
    const info = (acct.account.data as { parsed: { info: { owner: string; tokenAmount: { amount: string } } } }).parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount > 0n) holders[info.owner] = (holders[info.owner] ?? 0n) + amount;
  }
  return holders;
}

// ── Staked amounts ────────────────────────────────────────────────────────────

async function fetchStakedAmounts(
  connection: Connection,
  adminKeypair: Keypair,
): Promise<Record<string, bigint>> {
  try {
    const provider = new AnchorProvider(connection, new Wallet(adminKeypair), { commitment: 'confirmed' });
    const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
    if (!idl) return {};
    const program = new Program(idl as never, provider);
    const stakeAccounts = await (program.account as any)['stakeAccount'].all() as Array<{ account: StakeAccountData }>;
    const result: Record<string, bigint> = {};
    for (const { account } of stakeAccounts) {
      result[account.owner.toBase58()] = BigInt(account.amountStaked.toString());
    }
    return result;
  } catch {
    return {}; // staking program not yet deployed — treat all as 1x weight
  }
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
    const adminKeypair = loadAdminKeypair(); // only used for staking IDL fetch

    log.push(`[${ts()}] Cron started. Vault: ${VAULT_PUBKEY.toBase58()}`);

    // ── Phase 1: Liquidate ALL vault tokens ──────────────────────────────────

    log.push(`[${ts()}] Phase 1: liquidation`);
    const tokens = await fetchVaultTokens(connection);
    log.push(`  ${tokens.length} token(s) in vault`);

    const liquidations = loadJson<LiquidationEntry>(LIQUIDATIONS_PATH);
    let newLiquidationSol = 0;

    for (const token of tokens) {
      log.push(`  Swapping ${token.mint.slice(0, 8)}... (${token.rawAmount} raw)`);
      try {
        const result = await swapToSol(connection, vaultKeypair, token.mint, token.rawAmount);
        log.push(`    ✓ ${result.solReceived.toFixed(6)} SOL  tx: ${result.txSignature.slice(0, 16)}...`);
        newLiquidationSol += result.solReceived;
        liquidations.push({
          date: ts(),
          mint: token.mint,
          amountIn: token.rawAmount,
          solReceived: result.solReceived,
          txSignature: result.txSignature,
          distributed: false,
        });
        saveJson(LIQUIDATIONS_PATH, liquidations); // persist after each swap
      } catch (err) {
        log.push(`    ✗ swap failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log.push(`  New SOL from liquidations: ${newLiquidationSol.toFixed(6)}`);

    // ── Phase 2: Tally undistributed SOL ─────────────────────────────────────

    log.push(`[${ts()}] Phase 2: tallying undistributed SOL`);

    const allLiquidations = loadJson<LiquidationEntry>(LIQUIDATIONS_PATH);
    const undistributedLiq = allLiquidations.filter((e) => !e.distributed);
    const liquidationSol = undistributedLiq.reduce((s, e) => s + e.solReceived, 0);

    const fees = loadJson<FeeEntry>(FEES_PATH);
    const undistributedFees = fees.filter((e) => !e.distributed);
    const feeSol = undistributedFees.reduce((s, e) => s + e.solFees, 0);

    const allDonations = loadDonations();
    const undistributedDonations = allDonations.filter((e) => !e.distributed);
    const donationSol = undistributedDonations.reduce((s, e) => s + e.solDonated, 0);

    const totalSol = liquidationSol + feeSol + donationSol;

    log.push(`  Liquidations: ${liquidationSol.toFixed(6)} SOL`);
    log.push(`  Platform fees: ${feeSol.toFixed(6)} SOL`);
    log.push(`  Donations: ${donationSol.toFixed(6)} SOL`);
    log.push(`  Total: ${totalSol.toFixed(6)} SOL`);

    if (totalSol < 0.001) {
      log.push('  Less than 0.001 SOL to distribute — skipping distribution.');
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    // ── Phase 3: Fetch SMELT holders + staking weights ────────────────────────

    log.push(`[${ts()}] Phase 3: SMELT holders + weights`);
    const holders = await fetchSmeltHolders(connection);
    const staked = await fetchStakedAmounts(connection, adminKeypair);
    log.push(`  ${Object.keys(holders).length} SMELT holder(s)`);

    const weights: Record<string, number> = {};
    let totalWeight = 0;
    for (const [owner, balance] of Object.entries(holders)) {
      const stakedAmount = staked[owner] ?? 0n;
      const w = Number(balance) + Number(stakedAmount) * STAKING_BOOST;
      weights[owner] = w;
      totalWeight += w;
    }

    if (totalWeight === 0) {
      log.push('  No weighted holders — cannot distribute.');
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    // ── Phase 4: Distribute proportionally FROM vault keypair ─────────────────

    log.push(`[${ts()}] Phase 4: distribution`);

    // Reserve 0.01 SOL in vault for rent exemption + future tx fees
    const VAULT_RESERVE_SOL = 0.01;
    const vaultBalance = await connection.getBalance(vaultKeypair.publicKey) / LAMPORTS_PER_SOL;
    const distributableSol = Math.max(0, Math.min(totalSol, vaultBalance - VAULT_RESERVE_SOL));
    log.push(`  Vault balance: ${vaultBalance.toFixed(6)} SOL, reserve: ${VAULT_RESERVE_SOL} SOL, distributable: ${distributableSol.toFixed(6)} SOL`);

    if (distributableSol < 0.001) {
      log.push('  Not enough SOL above reserve to distribute — vault needs funding.');
      return NextResponse.json({ ok: true, log, liquidated: tokens.length, distributed: 0 });
    }

    const totalLamports = Math.floor(distributableSol * LAMPORTS_PER_SOL);
    const recipients: Array<{ address: PublicKey; lamports: number }> = [];
    for (const [owner, weight] of Object.entries(weights)) {
      const share = Math.floor((weight / totalWeight) * totalLamports);
      if (share > 0) recipients.push({ address: new PublicKey(owner), lamports: share });
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

    // ── Phase 5: Mark as distributed ─────────────────────────────────────────

    for (const e of undistributedLiq) e.distributed = true;
    saveJson(LIQUIDATIONS_PATH, allLiquidations);

    for (const e of undistributedFees) e.distributed = true;
    saveJson(FEES_PATH, fees);

    for (const e of undistributedDonations) e.distributed = true;
    saveJson(DONATIONS_PATH, allDonations);

    const distributions = loadJson<DistributionEntry>(DISTRIBUTIONS_PATH);
    distributions.push({
      date: ts(),
      totalSol,
      liquidationSol,
      feeSol,
      donationSol,
      recipientCount: recipients.length,
      txSignatures,
    });
    saveJson(DISTRIBUTIONS_PATH, distributions);

    log.push(`[${ts()}] Done. ${txSignatures.length} distribution tx(s) sent.`);

    return NextResponse.json({
      ok: true,
      liquidated: tokens.length,
      distributed: recipients.length,
      totalSol,
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
