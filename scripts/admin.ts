// scripts/admin.ts
import * as fs from 'fs';
import * as path from 'path';
import { Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  SMELT_MINT,
  VAULT_PUBKEY,
  LIQUIDATION_THRESHOLD_USD,
  currentSmeltPerAccount,
} from '../lib/constants';
import { MAINNET_RPC } from '../lib/solana';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  distributed: boolean;
}

interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

const LIQUIDATIONS_PATH = path.join(__dirname, '../data/liquidations.json');
const DISTRIBUTIONS_PATH = path.join(__dirname, '../data/distributions.json');
const FEES_PATH = path.join(__dirname, '../data/fees.json');

function loadJson<T>(filepath: string, fallback: T): T {
  if (!fs.existsSync(filepath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function fetchVaultTokens(connection: Connection): Promise<Array<{ mint: string; uiAmount: number; usdValue?: number }>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens = accounts.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null };
      };
      return {
        mint: info.mint,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    })
    .filter((t) => t.uiAmount > 0);

  if (tokens.length > 0) {
    const mints = tokens.map((t) => t.mint).join(',');
    try {
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`);
      if (res.ok) {
        const json = await res.json() as { data: Record<string, { price: number }> };
        return tokens.map((t) => ({
          ...t,
          usdValue: (t.uiAmount * (json.data[t.mint]?.price ?? 0)),
        }));
      }
    } catch { /* ignore */ }
  }
  return tokens;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function main(): Promise<void> {
  const connection = new Connection(MAINNET_RPC, 'confirmed');

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║          SMELT Admin Dashboard               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Vault tokens
  console.log('── Vault Token Balances ──────────────────────');
  try {
    const tokens = await fetchVaultTokens(connection);
    if (tokens.length === 0) {
      console.log('  (empty)');
    } else {
      let vaultTotal = 0;
      for (const t of tokens) {
        const usd = t.usdValue ?? 0;
        vaultTotal += usd;
        const bar = usd > LIQUIDATION_THRESHOLD_USD ? ' [READY TO SWAP]' : ` ($${usd.toFixed(2)} / $${LIQUIDATION_THRESHOLD_USD})`;
        console.log(`  ${t.mint.slice(0, 12)}...  ${t.uiAmount.toLocaleString()}${bar}`);
      }
      console.log(`  Total vault USD value: $${vaultTotal.toFixed(2)}`);
    }
  } catch (err) {
    console.log(`  Error fetching vault: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('');
  console.log('── Pending Profit ────────────────────────────');
  const liquidations = loadJson<LiquidationEntry[]>(LIQUIDATIONS_PATH, []);
  const undistributed = liquidations.filter((e) => !e.distributed);
  const pendingSol = undistributed.reduce((s, e) => s + e.solReceived, 0);

  interface FeeEntry { date: string; wallet: string; accountsClosed: number; solFees: number; distributed: boolean; }
  const fees = loadJson<FeeEntry[]>(FEES_PATH, []);
  const pendingFeeSol = fees.filter((f) => !f.distributed).reduce((s, f) => s + f.solFees, 0);
  const totalAccountsClosed = fees.reduce((s, f) => s + f.accountsClosed, 0);
  const totalFeeSol = fees.reduce((s, f) => s + f.solFees, 0);

  console.log(`  Undistributed liquidation SOL: ${pendingSol.toFixed(6)} SOL`);
  console.log(`  Undistributed fee SOL:         ${pendingFeeSol.toFixed(6)} SOL`);
  console.log(`  Total pending:                 ${(pendingSol + pendingFeeSol).toFixed(6)} SOL`);
  console.log(`  Accounts closed (all time):    ${totalAccountsClosed}`);
  console.log(`  Total fees collected:          ${totalFeeSol.toFixed(6)} SOL`);

  console.log('');
  console.log('── SMELT Token ───────────────────────────────');
  try {
    const supply = await connection.getTokenSupply(SMELT_MINT);
    console.log(`  Circulating supply:  ${(supply.value.uiAmount ?? 0).toLocaleString()} SMELT`);
  } catch {
    console.log('  (could not fetch supply)');
  }

  console.log('');
  console.log('── Emission Epoch ────────────────────────────');
  const smeltPerAccount = currentSmeltPerAccount();
  console.log(`  Current SMELT per recycle: ${smeltPerAccount}`);

  console.log('');
  console.log('── Last Liquidation ──────────────────────────');
  const lastLiquidation = [...liquidations].reverse().find(Boolean);
  if (lastLiquidation) {
    console.log(`  Date:   ${formatDate(lastLiquidation.date)}`);
    console.log(`  Token:  ${lastLiquidation.mint.slice(0, 16)}...`);
    console.log(`  SOL:    ${lastLiquidation.solReceived.toFixed(6)}`);
  } else {
    console.log('  No liquidations yet');
  }

  console.log('');
  console.log('── Last Distribution ─────────────────────────');
  const distributions = loadJson<DistributionEntry[]>(DISTRIBUTIONS_PATH, []);
  const lastDist = [...distributions].reverse().find(Boolean);
  if (lastDist) {
    console.log(`  Date:       ${formatDate(lastDist.date)}`);
    console.log(`  SOL sent:   ${lastDist.totalSol.toFixed(6)}`);
    console.log(`  Recipients: ${lastDist.recipientCount}`);
  } else {
    console.log('  No distributions yet');
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
