// lib/smelt.ts
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SMELT_MINT, STAKING_POOL_ATA } from './constants';

export interface StakeInfo {
  smeltStaked: bigint;
  stakedUi: number;
  sharePct: number;
  depositedAt: string | null;
  cooldownStartedAt: string | null;
  epochStart: string;
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
 * Fetch pool stake info for a wallet from the API.
 */
export async function fetchStakeInfo(wallet: PublicKey): Promise<StakeInfo | null> {
  try {
    const res = await fetch(`/api/stake?wallet=${wallet.toBase58()}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      staked: string;
      stakedUi: number;
      sharePct: number;
      depositedAt: string | null;
      cooldownStartedAt: string | null;
      epochStart: string;
    };
    return {
      smeltStaked: BigInt(data.staked),
      stakedUi: data.stakedUi,
      sharePct: data.sharePct,
      depositedAt: data.depositedAt,
      cooldownStartedAt: data.cooldownStartedAt,
      epochStart: data.epochStart,
    };
  } catch {
    return null;
  }
}

/**
 * Build a transaction that transfers SMELT from owner to the staking pool ATA.
 * User signs and sends this; then calls POST /api/stake with the tx signature.
 */
export async function buildStakeTransaction(
  connection: Connection,
  owner: PublicKey,
  amountRaw: bigint,
): Promise<Transaction> {
  const ownerATA = await getAssociatedTokenAddress(
    SMELT_MINT,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction().add(
    createTransferCheckedInstruction(
      ownerATA,
      SMELT_MINT,
      STAKING_POOL_ATA,
      owner,
      amountRaw,
      9,
      [],
      TOKEN_PROGRAM_ID,
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  return tx;
}
