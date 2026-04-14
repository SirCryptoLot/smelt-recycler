import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import * as fs from 'fs';
import { SMELT_MINT, STAKING_PROGRAM_ID } from '../lib/constants';
import idl from '../target/idl/smelt_staking.json';

async function main() {
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('data/keypairs/admin.json', 'utf-8')))
  );
  const rpc = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
  const connection = new Connection(rpc, 'confirmed');
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as unknown as anchor.Idl, provider);

  const [globalStatePda] = PublicKey.findProgramAddressSync([Buffer.from('global')], STAKING_PROGRAM_ID);
  const vaultAta = getAssociatedTokenAddressSync(SMELT_MINT, globalStatePda, true);

  await (program.methods as any).initialize()
    .accounts({
      admin: adminKeypair.publicKey,
      smeltMint: SMELT_MINT,
      globalState: globalStatePda,
      vault: vaultAta,
    })
    .rpc();

  console.log('✓ GlobalState initialized:', globalStatePda.toBase58());
  console.log('✓ Vault ATA:', vaultAta.toBase58());
}

main().catch(console.error);
