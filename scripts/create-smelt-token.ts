import { Connection, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const RPC = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const DECIMALS = 9;
// 1 billion tokens × 10^9 raw units
const TOTAL_SUPPLY = 1_000_000_000_000_000_000n;

async function main() {
  const keypairPath = path.join('data', 'keypairs', 'admin.json');
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );

  const connection = new Connection(RPC, 'confirmed');
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 0.05 * 1e9) {
    throw new Error(`Admin needs SOL. Run: solana airdrop 2 ${adminKeypair.publicKey.toBase58()} --url devnet`);
  }

  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);

  const mint = await createMint(
    connection,
    adminKeypair,
    adminKeypair.publicKey, // mint authority
    null,                   // freeze authority (none)
    DECIMALS,
  );
  console.log('✓ SMELT mint:', mint.toBase58());

  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection, adminKeypair, mint, adminKeypair.publicKey
  );

  await mintTo(connection, adminKeypair, mint, adminAta.address, adminKeypair, TOTAL_SUPPLY);
  console.log('✓ Minted 1,000,000,000 SMELT');
  console.log('\n→ Update lib/constants.ts: SMELT_MINT =', mint.toBase58());
}

main().catch(console.error);
