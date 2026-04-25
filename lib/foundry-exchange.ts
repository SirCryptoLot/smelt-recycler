// lib/foundry-exchange.ts
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { MAINNET_RPC } from './solana';
import { SMELT_MINT } from './constants';
import { getForgeBuildings, saveForgeBuildings } from './foundry-buildings';
import { getWalletStats } from './leaderboard';
import { getPlots } from './foundry';

// ── Constants ─────────────────────────────────────────────────────────────────

export const INGOTS_PER_SMELT = 1000;
export const BUY_TAX_BPS     = 500;   // 5%
export const SELL_TAX_BPS    = 1000;  // 10%

const VAULT_PUBKEY    = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');
const VAULT_SMELT_ATA = new PublicKey('9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok');
const DEV_PUBKEY      = new PublicKey('J1aBWq9JmvA4fkqSfV4TthiwkBp5zn5ZZt5D2YSuE3Yw');
const SMELT_DECIMALS  = 6;

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── Rate ──────────────────────────────────────────────────────────────────────

export function getExchangeRate(): {
  ingotsPerSmelt: number;
  buyTaxPct: number;
  sellTaxPct: number;
} {
  return {
    ingotsPerSmelt: INGOTS_PER_SMELT,
    buyTaxPct: BUY_TAX_BPS / 100,
    sellTaxPct: SELL_TAX_BPS / 100,
  };
}

// ── Buy-in ────────────────────────────────────────────────────────────────────

export async function verifyBuyTx(txSig: string, wallet: string, expectedVaultUnits: bigint): Promise<void> {
  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const tx = await connection.getParsedTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  if (!tx) throw new Error('Transaction not found');
  if (tx.meta?.err) throw new Error('Transaction failed on-chain');

  const accountKeys = tx.transaction.message.accountKeys.map((k: { pubkey: PublicKey } | string) =>
    typeof k === 'string' ? k : (k as { pubkey: PublicKey }).pubkey.toBase58()
  );
  if (!accountKeys.includes(wallet)) throw new Error('Wallet not in transaction');

  const instructions = tx.transaction.message.instructions;
  let vaultReceived = BigInt(0);
  for (const ix of instructions) {
    if ('parsed' in ix && ix.parsed?.type === 'transferChecked') {
      const info = ix.parsed.info as { mint: string; destination: string; authority: string; tokenAmount: { amount: string } };
      if (
        info.mint === SMELT_MINT.toBase58() &&
        info.destination === VAULT_SMELT_ATA.toBase58() &&
        info.authority === wallet
      ) {
        vaultReceived += BigInt(info.tokenAmount.amount);
      }
    }
  }
  if (vaultReceived < expectedVaultUnits) {
    throw new Error(`Vault received ${vaultReceived} units, expected at least ${expectedVaultUnits}`);
  }
}

export async function creditIngots(wallet: string, smeltAmount: number): Promise<number> {
  const plots = getPlots();
  const plot = plots.find(p => p.owner === wallet);
  if (!plot) throw new Error('No forge found for this wallet');

  const stats = getWalletStats(wallet);
  const fb = getForgeBuildings(plot.id, stats.allTime.smeltEarned);

  const ingots = Math.floor(smeltAmount * INGOTS_PER_SMELT);
  fb.ingotBalance += ingots;
  saveForgeBuildings(fb);
  return fb.ingotBalance;
}

// ── Cashout ───────────────────────────────────────────────────────────────────

export async function cashoutIngots(wallet: string, ingots: number): Promise<string> {
  const plots = getPlots();
  const plot = plots.find(p => p.owner === wallet);
  if (!plot) throw new Error('No forge found for this wallet');

  const stats = getWalletStats(wallet);
  const fb = getForgeBuildings(plot.id, stats.allTime.smeltEarned);

  if (fb.ingotBalance < ingots) throw new Error('Not enough Ingots');

  const totalSmelt = ingots / INGOTS_PER_SMELT;
  const sellTax    = SELL_TAX_BPS / 10000;
  const userSmelt  = totalSmelt * (1 - sellTax);
  const devSmelt   = totalSmelt * sellTax;

  const userUnits = BigInt(Math.floor(userSmelt * 10 ** SMELT_DECIMALS));
  const devUnits  = BigInt(Math.floor(devSmelt  * 10 ** SMELT_DECIMALS));

  if (userUnits === BigInt(0)) throw new Error('Payout too small');

  const connection    = new Connection(MAINNET_RPC, 'confirmed');
  const vaultKeypair  = loadVaultKeypair();
  const userPubkey    = new PublicKey(wallet);
  const userSmeltATA  = getAssociatedTokenAddressSync(SMELT_MINT, userPubkey);
  const devSmeltATA   = getAssociatedTokenAddressSync(SMELT_MINT, DEV_PUBKEY);

  const tx = new Transaction();

  tx.add(createTransferCheckedInstruction(
    VAULT_SMELT_ATA, SMELT_MINT, userSmeltATA,
    vaultKeypair.publicKey, userUnits, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID,
  ));

  if (devUnits > BigInt(0)) {
    tx.add(createTransferCheckedInstruction(
      VAULT_SMELT_ATA, SMELT_MINT, devSmeltATA,
      vaultKeypair.publicKey, devUnits, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID,
    ));
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair], { commitment: 'confirmed' });

  fb.ingotBalance -= ingots;
  saveForgeBuildings(fb);

  return sig;
}
