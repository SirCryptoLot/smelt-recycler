// Sets Metaplex token metadata for the SMELT mint.
// Run AFTER funding the vault (needs ~0.007 SOL for metadata account rent).
// Uses: vault as fee payer, admin as mint authority.
//
// node scripts/set-smelt-metadata.mjs

import { readFileSync } from 'fs';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

// ── Config ────────────────────────────────────────────────────────────────────

const RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';
const SMELT_MINT = new PublicKey('SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8');
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const NAME   = 'SMELT Recycler Token';
const SYMBOL = 'SMELT';
const URI    = 'https://smelt-recycler-production.up.railway.app/smelt-metadata.json';

// ── Keypair loaders ───────────────────────────────────────────────────────────

function loadAdminKeypair() {
  const raw = JSON.parse(readFileSync('data/keypairs/admin.json', 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadVaultKeypair() {
  const env = readFileSync('.env.local', 'utf-8');
  const match = env.match(/VAULT_KEYPAIR=(\[.*?\])/);
  if (!match) throw new Error('VAULT_KEYPAIR not found in .env.local');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(match[1])));
}

// ── Borsh encoding ────────────────────────────────────────────────────────────

function encodeString(str) {
  const bytes = Buffer.from(str, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

// CreateMetadataAccountV3 — instruction index 33
function buildCreateMetadataV3Data(name, symbol, uri) {
  return Buffer.concat([
    Buffer.from([33]),        // instruction enum index
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
    Buffer.from([0, 0]),      // seller_fee_basis_points: u16 = 0
    Buffer.from([0]),         // creators: Option = None
    Buffer.from([0]),         // collection: Option = None
    Buffer.from([0]),         // uses: Option = None
    Buffer.from([1]),         // is_mutable: true
    Buffer.from([0]),         // collection_details: Option = None
  ]);
}

// ── PDA ───────────────────────────────────────────────────────────────────────

function getMetadataPDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  return pda;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const connection = new Connection(RPC, 'confirmed');
const admin = loadAdminKeypair();
const vault = loadVaultKeypair();

console.log('Admin (mint authority):', admin.publicKey.toBase58());
console.log('Vault (fee payer):     ', vault.publicKey.toBase58());

const vaultBalance = await connection.getBalance(vault.publicKey);
console.log('Vault SOL balance:     ', vaultBalance / 1e9);
if (vaultBalance < 0.007 * 1e9) {
  throw new Error('Vault needs at least 0.007 SOL for metadata account rent. Fund it first.');
}

const metadataPDA = getMetadataPDA(SMELT_MINT);
console.log('\nMetadata PDA:', metadataPDA.toBase58());

// Check if metadata already exists
const existing = await connection.getAccountInfo(metadataPDA);
if (existing) {
  console.log('⚠️  Metadata account already exists — use UpdateMetadata instead.');
  process.exit(1);
}

const data = buildCreateMetadataV3Data(NAME, SYMBOL, URI);

const ix = new TransactionInstruction({
  programId: TOKEN_METADATA_PROGRAM_ID,
  keys: [
    { pubkey: metadataPDA,           isSigner: false, isWritable: true  }, // metadata PDA
    { pubkey: SMELT_MINT,            isSigner: false, isWritable: false }, // mint
    { pubkey: admin.publicKey,       isSigner: true,  isWritable: false }, // mint authority
    { pubkey: vault.publicKey,       isSigner: true,  isWritable: true  }, // payer (vault pays rent)
    { pubkey: admin.publicKey,       isSigner: false, isWritable: false }, // update authority
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY,    isSigner: false, isWritable: false },
  ],
  data,
});

const tx = new Transaction().add(ix);

console.log('\nSending transaction...');
const sig = await sendAndConfirmTransaction(connection, tx, [vault, admin], {
  commitment: 'confirmed',
});

console.log('\n✓ Metadata set!');
console.log('  Name:   ', NAME);
console.log('  Symbol: ', SYMBOL);
console.log('  URI:    ', URI);
console.log('  Tx:     ', sig);
console.log('\nVerify on Solscan: https://solscan.io/token/' + SMELT_MINT.toBase58());
