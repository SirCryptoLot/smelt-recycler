// lib/smelt.ts
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { SMELT_MINT, STAKING_PROGRAM_ID } from './constants';

export interface StakeInfo {
  amountStaked: bigint;   // raw, 9 decimals
  bump: number;
}

/**
 * Fetch the user's SMELT token balance (raw units, 9 decimals).
 * Returns 0n if account doesn't exist.
 */
export async function fetchSmeltBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(
      SMELT_MINT,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const info = await connection.getTokenAccountBalance(ata);
    return BigInt(info.value.amount);
  } catch {
    return 0n;
  }
}

/**
 * Fetch the user's StakeAccount PDA data.
 * Returns null if the account doesn't exist (user has never staked).
 */
export async function fetchStakeInfo(
  connection: Connection,
  owner: PublicKey,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<StakeInfo | null> {
  try {
    const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
    const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
    if (!idl) return null;
    const program = new Program(idl as never, provider);

    const [stakeAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('stake'), owner.toBuffer()],
      STAKING_PROGRAM_ID,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (program.account as any)['stakeAccount'].fetchNullable(stakeAccountPda);
    if (!account) return null;
    const data = account as { amountStaked: BN; bump: number };
    return {
      amountStaked: BigInt(data.amountStaked.toString()),
      bump: data.bump,
    };
  } catch {
    return null;
  }
}

/**
 * Build a `stake` instruction transaction.
 * Caller must sign and send.
 */
export async function buildStakeTransaction(
  connection: Connection,
  owner: PublicKey,
  amountRaw: bigint,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  if (!idl) throw new Error('Could not load staking program IDL');
  const program = new Program(idl as never, provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await (program.methods as any)
    .stake(new BN(amountRaw.toString()))
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return tx;
}

/**
 * Build an `unstake` instruction transaction.
 * Caller must sign and send.
 */
export async function buildUnstakeTransaction(
  connection: Connection,
  owner: PublicKey,
  amountRaw: bigint,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
): Promise<Transaction> {
  const provider = new AnchorProvider(connection, wallet as never, { commitment: 'confirmed' });
  const idl = await Program.fetchIdl(STAKING_PROGRAM_ID, provider);
  if (!idl) throw new Error('Could not load staking program IDL');
  const program = new Program(idl as never, provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await (program.methods as any)
    .unstake(new BN(amountRaw.toString()))
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return tx;
}
