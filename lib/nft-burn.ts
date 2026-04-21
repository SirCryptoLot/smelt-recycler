// lib/nft-burn.ts
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { MAINNET_RPC } from './solana';

const VAULT = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');
const FEE_LAMPORTS_PER_NFT = Math.ceil(0.002 * 0.05 * LAMPORTS_PER_SOL);
const NET_LAMPORTS_PER_NFT = Math.round(0.002 * 0.95 * LAMPORTS_PER_SOL);
const NFT_BATCH_SIZE = 5; // burn+close = 2 ixs each; 5 NFTs + fee = 11 ixs well within limits
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export type NftClassification = 'spam' | 'unknown' | 'protected';

export interface NftAsset {
  id: string;              // mint address
  name: string;
  image: string | null;
  classification: NftClassification;
  tokenAccount: string;    // owner's ATA
  collectionName: string | null;
  collectionVerified: boolean;
}

interface DasAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  grouping?: Array<{
    group_key: string;
    group_value?: string;
    verified?: boolean;
    collection_metadata?: { name?: string };
  }>;
  creators?: Array<{ address: string; verified: boolean; share: number }>;
  ownership?: {
    owner?: string;
    token_account?: string;
  };
  token_info?: {
    supply?: number;
    decimals?: number;
    associated_token_address?: string;
    price_info?: { price_per_token?: number; currency?: string };
  };
  compression?: { compressed?: boolean };
}

function classifyAsset(asset: DasAsset): NftClassification {
  const collection = asset.grouping?.find((g) => g.group_key === 'collection');
  const collectionVerified = collection?.verified === true;

  // Floor price in USD — if available and high enough, protect it
  const floorUsd = asset.token_info?.price_info?.price_per_token ?? 0;

  if (collectionVerified && floorUsd > 0.5) return 'protected';
  if (!collectionVerified) return 'spam';
  return 'unknown';
}

export async function fetchNfts(walletAddress: PublicKey): Promise<NftAsset[]> {
  const allAssets: DasAsset[] = [];
  let page = 1;

  // Paginate through all assets (limit 1000 per page)
  while (true) {
    try {
      const res = await fetch(MAINNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'fetch-nfts',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress.toBase58(),
            page,
            limit: 1000,
            displayOptions: { showFungible: false, showNativeBalance: false },
          },
        }),
      });
      if (!res.ok) break;
      const json = await res.json() as { result?: { items?: DasAsset[]; total?: number } };
      const items = json.result?.items ?? [];
      allAssets.push(...items);
      if (items.length < 1000) break;
      page++;
    } catch {
      break;
    }
  }

  return allAssets
    .filter((a) => {
      // Only standard non-compressed NFTs with a token account
      const isNft = a.interface === 'V1_NFT' || a.interface === 'V1_PRINT';
      const compressed = a.compression?.compressed === true;
      const tokenAccount = a.ownership?.token_account ?? a.token_info?.associated_token_address;
      return isNft && !compressed && !!tokenAccount;
    })
    .map((a): NftAsset => {
      const collection = a.grouping?.find((g) => g.group_key === 'collection');
      const tokenAccount = (a.ownership?.token_account ?? a.token_info?.associated_token_address)!;
      return {
        id: a.id,
        name: a.content?.metadata?.name ?? 'Unknown NFT',
        image: a.content?.links?.image ?? null,
        classification: classifyAsset(a),
        tokenAccount,
        collectionName: collection?.collection_metadata?.name ?? null,
        collectionVerified: collection?.verified === true,
      };
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function buildNftBatchTransaction(
  batch: NftAsset[],
  owner: PublicKey,
  blockhash: string,
): Promise<Transaction> {
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  for (const nft of batch) {
    const tokenAccount = new PublicKey(nft.tokenAccount);
    const mint = new PublicKey(nft.id);
    // Burn 1 token (NFT has supply=1, decimals=0)
    tx.add(createBurnCheckedInstruction(tokenAccount, mint, owner, 1n, 0, [], TOKEN_PROGRAM_ID));
    // Close the now-empty account to reclaim rent
    tx.add(createCloseAccountInstruction(tokenAccount, owner, owner, [], TOKEN_PROGRAM_ID));
  }

  // Platform fee (5% of reclaimed rent per NFT)
  tx.add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: VAULT,
      lamports: FEE_LAMPORTS_PER_NFT * batch.length,
    }),
  );

  return tx;
}

async function sendWithRetry(connection: Connection, signedTx: Transaction): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      const { value } = await connection.confirmTransaction(sig, 'confirmed');
      if (value.err) throw new Error(`On-chain error: ${JSON.stringify(value.err)}`);
      return true;
    } catch {
      if (attempt === MAX_RETRIES - 1) return false;
    }
  }
  return false;
}

export async function burnNfts(
  nfts: NftAsset[],
  owner: PublicKey,
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>,
  connection: Connection,
): Promise<{ succeeded: number; failed: number; solReclaimed: number }> {
  const batches = chunk(nfts, NFT_BATCH_SIZE);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const transactions = await Promise.all(
    batches.map((batch) => buildNftBatchTransaction(batch, owner, blockhash)),
  );

  const signedTransactions = await signAllTransactions(transactions);

  const results = await Promise.all(
    signedTransactions.map((signedTx, i) =>
      sendWithRetry(connection, signedTx).then((ok) => ({ ok, batchSize: batches[i].length })),
    ),
  );

  let succeeded = 0;
  let failed = 0;
  for (const { ok, batchSize } of results) {
    if (ok) succeeded += batchSize;
    else failed += batchSize;
  }

  return {
    succeeded,
    failed,
    solReclaimed: succeeded * NET_LAMPORTS_PER_NFT / LAMPORTS_PER_SOL,
  };
}
