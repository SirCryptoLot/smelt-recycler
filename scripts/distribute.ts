// scripts/distribute.ts
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
import {
  SMELT_MINT,
  STAKING_PROGRAM_ID,
  STAKING_BOOST,
} from '../lib/constants';
import { MAINNET_RPC } from '../lib/solana';

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

interface StakeAccountData {
  owner: PublicKey;
  amountStaked: { toString(): string };
  bump: number;
}

const LIQUIDATIONS_PATH = path.join(__dirname, '../data/liquidations.json');
const DISTRIBUTIONS_PATH = path.join(__dirname, '../data/distributions.json');
const FEES_PATH = path.join(__dirname, '../data/fees.json');
const ADMIN_KEYPAIR_PATH = path.join(__dirname, '../data/keypairs/admin.json');

const TRANSFERS_PER_TX = 20;

function loadKeypair(filepath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

interface FeeEntry {
  date: string;
  wallet: string;
  accountsClosed: number;
  solFees: number;
  distributed: boolean;
}

function loadLiquidations(): LiquidationEntry[] {
  if (!fs.existsSync(LIQUIDATIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(LIQUIDATIONS_PATH, 'utf-8')) as LiquidationEntry[];
}

function loadFees(): FeeEntry[] {
  if (!fs.existsSync(FEES_PATH)) return [];
  return JSON.parse(fs.readFileSync(FEES_PATH, 'utf-8')) as FeeEntry[];
}

function loadDistributions(): DistributionEntry[] {
  if (!fs.existsSync(DISTRIBUTIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(DISTRIBUTIONS_PATH, 'utf-8')) as DistributionEntry[];
}

async function fetchSmeltHolders(connection: Connection): Promise<Record<string, bigint>> {
  const tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: SMELT_MINT.toBase58() } },
    ],
  });

  const holders: Record<string, bigint> = {};
  for (const account of tokenAccounts) {
    const info = (account.account.data as { parsed: { info: { owner: string; tokenAmount: { amount: string } } } }).parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    if (amount > 0n) {
      holders[info.owner] = (holders[info.owner] ?? 0n) + amount;
    }
  }
  return holders;
}

async function fetchStakedAmounts(
  connection: Connection,
  adminKeypair: Keypair,
): Promise<Record<string, bigint>> {
  const provider = new AnchorProvider(
    connection,
    new Wallet(adminKeypair),
    { commitment: 'confirmed' }
  );

  let idl: unknown;
  try {
    idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  } catch {
    console.warn('Could not fetch IDL — staking data unavailable, treating all as 1x weight');
    return {};
  }
  if (!idl) return {};

  const program = new Program(idl as never, provider);
  const stakeAccounts = await (program.account as any)['stakeAccount'].all();

  const result: Record<string, bigint> = {};
  for (const { account } of stakeAccounts) {
    const data = account as StakeAccountData;
    result[data.owner.toBase58()] = BigInt(data.amountStaked.toString());
  }
  return result;
}

async function main(): Promise<void> {
  console.log('=== SMELT Distributor ===\n');

  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);

  // 1. Sum undistributed SOL from liquidations + platform fees
  const liquidations = loadLiquidations();
  const undistributedLiquidations = liquidations.filter((e) => !e.distributed);
  const liquidationSol = undistributedLiquidations.reduce((sum, e) => sum + e.solReceived, 0);

  const fees = loadFees();
  const undistributedFees = fees.filter((e) => !e.distributed);
  const feeSol = undistributedFees.reduce((sum, e) => sum + e.solFees, 0);

  const totalSol = liquidationSol + feeSol;

  if (totalSol === 0) {
    console.log('No undistributed SOL. Run `npm run liquidate` first or wait for recycling fees to accumulate.');
    return;
  }

  console.log(`Undistributed SOL breakdown:`);
  console.log(`  Token liquidations: ${liquidationSol.toFixed(6)} SOL`);
  console.log(`  Platform fees:      ${feeSol.toFixed(6)} SOL`);
  console.log(`  Total:              ${totalSol.toFixed(6)} SOL`);

  // 2. Fetch SMELT holders
  console.log('Fetching SMELT holders...');
  const holders = await fetchSmeltHolders(connection);
  const holderCount = Object.keys(holders).length;
  console.log(`Found ${holderCount} SMELT holders`);

  // 3. Fetch staked amounts
  console.log('Fetching staking data...');
  const staked = await fetchStakedAmounts(connection, adminKeypair);

  // 4. Calculate weights
  const weights: Record<string, number> = {};
  let totalWeight = 0;

  for (const [owner, balance] of Object.entries(holders)) {
    const stakedAmount = staked[owner] ?? 0n;
    const weight = Number(balance) * 1 + Number(stakedAmount) * STAKING_BOOST;
    weights[owner] = weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    console.log('Total weight is 0 — no distribution possible.');
    return;
  }

  // 5. Calculate per-wallet lamports
  const totalLamports = Math.floor(totalSol * LAMPORTS_PER_SOL);
  const recipients: Array<{ address: PublicKey; lamports: number }> = [];

  for (const [owner, weight] of Object.entries(weights)) {
    const share = Math.floor((weight / totalWeight) * totalLamports);
    if (share > 0) {
      recipients.push({ address: new PublicKey(owner), lamports: share });
    }
  }

  console.log(`\nDistributing ${totalSol.toFixed(6)} SOL to ${recipients.length} recipients`);
  console.log(`Batch size: ${TRANSFERS_PER_TX} transfers per tx\n`);

  // 6. Send in batches
  const txSignatures: string[] = [];
  for (let i = 0; i < recipients.length; i += TRANSFERS_PER_TX) {
    const batch = recipients.slice(i, i + TRANSFERS_PER_TX);
    const tx = new Transaction();
    for (const { address, lamports } of batch) {
      tx.add(SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: address,
        lamports,
      }));
    }
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
        commitment: 'confirmed',
      });
      txSignatures.push(sig);
      const batchNum = Math.floor(i / TRANSFERS_PER_TX) + 1;
      const totalBatches = Math.ceil(recipients.length / TRANSFERS_PER_TX);
      console.log(`  ✓ Batch ${batchNum}/${totalBatches}  tx: ${sig.slice(0, 16)}...`);
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Mark liquidations and fees as distributed
  for (const entry of undistributedLiquidations) entry.distributed = true;
  fs.writeFileSync(LIQUIDATIONS_PATH, JSON.stringify(liquidations, null, 2));

  for (const entry of undistributedFees) entry.distributed = true;
  fs.writeFileSync(FEES_PATH, JSON.stringify(fees, null, 2));

  // 8. Append distribution summary
  const distributions = loadDistributions();
  distributions.push({
    date: new Date().toISOString(),
    totalSol,
    recipientCount: recipients.length,
    txSignatures,
  });
  fs.writeFileSync(DISTRIBUTIONS_PATH, JSON.stringify(distributions, null, 2));

  console.log(`\nDistribution complete. ${txSignatures.length} transactions sent.`);
  console.log('Results saved to data/distributions.json');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
