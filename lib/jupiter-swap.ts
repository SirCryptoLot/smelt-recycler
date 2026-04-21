// lib/jupiter-swap.ts
import { VersionedTransaction } from '@solana/web3.js';
import { connection } from './solana';
import { SMELT_MINT } from './constants';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const SWAP_URL = 'https://quote-api.jup.ag/v6/swap';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: unknown[];
}

// Get a quote to swap SOL → SMELT.
// lamports: amount of SOL in lamports (1 SOL = 1_000_000_000 lamports)
export async function getSmeltQuote(lamports: number): Promise<JupiterQuote | null> {
  try {
    const url = `${QUOTE_URL}?inputMint=${SOL_MINT}&outputMint=${SMELT_MINT.toBase58()}&amount=${lamports}&slippageBps=100`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json() as JupiterQuote;
  } catch {
    return null;
  }
}

// Get current SMELT market price in USD.
// Tries Jupiter Price API v2 first, falls back to DexScreener.
export async function getSmeltPrice(): Promise<number | null> {
  // Attempt 1: Jupiter Price API v2
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${SMELT_MINT.toBase58()}`);
    if (res.ok) {
      const json = await res.json() as { data: Record<string, { price: string } | null> };
      const entry = json.data[SMELT_MINT.toBase58()];
      const price = entry ? parseFloat(entry.price) : 0;
      if (price > 0) return price;
    }
  } catch { /* fall through */ }

  // Attempt 2: DexScreener
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SMELT_MINT.toBase58()}`);
    if (!res.ok) return null;
    const json = await res.json() as { pairs?: { priceUsd?: string }[] };
    const price = parseFloat(json.pairs?.[0]?.priceUsd ?? '');
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

// Build a swap transaction from a quote. Returns base64-encoded transaction string.
export async function buildSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
): Promise<string> {
  const res = await fetch(SWAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.status}`);
  const { swapTransaction } = await res.json() as { swapTransaction: string };
  return swapTransaction;
}

// Sign and send a base64 swap transaction. Returns txSignature.
export async function executeSwap(
  swapTransaction: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
): Promise<string> {
  const buf = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(buf);
  const signed = await signTransaction(tx);
  const latestBlockhash = await connection.getLatestBlockhash();
  const txId = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction({ signature: txId, ...latestBlockhash }, 'confirmed');
  return txId;
}
