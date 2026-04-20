// scripts/liquidate.ts
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { swapToSol } from '../lib/jupiter';
import { VAULT_PUBKEY, LIQUIDATION_THRESHOLD_USD } from '../lib/constants';
import { MAINNET_RPC } from '../lib/solana';
import { DATA_DIR } from '../lib/paths';

interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

const DATA_PATH = path.join(DATA_DIR, 'liquidations.json');

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadLiquidations(): LiquidationEntry[] {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) as LiquidationEntry[];
}

function saveLiquidations(entries: LiquidationEntry[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2));
}

async function fetchVaultBalances(connection: Connection): Promise<Array<{ mint: string; rawAmount: number; uiAmount: number }>> {
  const accounts = await connection.getParsedTokenAccountsByOwner(VAULT_PUBKEY, {
    programId: TOKEN_PROGRAM_ID,
  });

  return accounts.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null; amount: string };
      };
      return {
        mint: info.mint,
        rawAmount: parseInt(info.tokenAmount.amount, 10),
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    })
    .filter((a) => a.uiAmount > 0);
}

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `https://price.jup.ag/v6/price?ids=${mints.join(',')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json() as { data: Record<string, { price: number }> };
    const result: Record<string, number> = {};
    for (const [mint, data] of Object.entries(json.data)) {
      result[mint] = data.price;
    }
    return result;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  console.log('=== SMELT Liquidator ===\n');

  const connection = new Connection(MAINNET_RPC, 'confirmed');
  const vaultKeypair = loadVaultKeypair();

  console.log(`Vault: ${VAULT_PUBKEY.toBase58()}`);
  console.log('Fetching vault balances...');

  const balances = await fetchVaultBalances(connection);
  if (balances.length === 0) {
    console.log('No token balances in vault.');
    return;
  }

  const mints = balances.map((b) => b.mint);
  const prices = await fetchPrices(mints);

  console.log(`\nFound ${balances.length} tokens:\n`);
  const toSwap: Array<{ mint: string; rawAmount: number; usdValue: number }> = [];

  for (const balance of balances) {
    const price = prices[balance.mint] ?? 0;
    const usdValue = balance.uiAmount * price;
    const flag = balance.rawAmount > 0 ? '→ SWAP' : '  skip';
    console.log(`  ${flag}  ${balance.mint.slice(0, 8)}...  $${usdValue.toFixed(2)}`);
    if (balance.rawAmount > 0) {
      toSwap.push({ mint: balance.mint, rawAmount: balance.rawAmount, usdValue });
    }
  }

  if (toSwap.length === 0) {
    console.log('\nNo tokens with non-zero balance. Nothing to liquidate.');
    return;
  }

  const entries = loadLiquidations();

  for (const token of toSwap) {
    console.log(`\nSwapping ${token.mint.slice(0, 8)}... ($${token.usdValue.toFixed(2)})`);
    try {
      const result = await swapToSol(connection, vaultKeypair, token.mint, token.rawAmount);
      console.log(`  ✓ Received ${result.solReceived.toFixed(6)} SOL  (tx: ${result.txSignature.slice(0, 16)}...)`);
      const entry: LiquidationEntry = {
        date: new Date().toISOString(),
        mint: token.mint,
        amountIn: token.rawAmount,
        solReceived: result.solReceived,
        txSignature: result.txSignature,
        distributed: false,
      };
      entries.push(entry);
      saveLiquidations(entries);
    } catch (err) {
      console.error(`  ✗ Swap failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\nLiquidation complete. Results saved to data/liquidations.json');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
