// lib/jupiter.ts
import {
  Connection,
  Keypair,
  VersionedTransaction,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';

const JUPITER_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapResult {
  inputMint: string;
  amountIn: number;        // raw token units
  solReceived: number;     // lamports → SOL (as decimal)
  txSignature: string;
}

/**
 * Swap `amountIn` raw units of `inputMint` to SOL via Jupiter V6.
 * Returns SwapResult on success, throws on failure.
 */
export async function swapToSol(
  connection: Connection,
  payer: Keypair,
  inputMint: string,
  amountIn: number,
): Promise<SwapResult> {
  // 1. Get quote
  const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${SOL_MINT}&amount=${amountIn}&slippageBps=100`;
  const quoteRes = await fetch(quoteUrl).catch((err: unknown) => {
    const cause = err instanceof Error ? (err as NodeJS.ErrnoException).cause : undefined;
    throw new Error(`Jupiter quote network error: ${err instanceof Error ? err.message : String(err)}${cause ? ` — cause: ${String(cause)}` : ''}`);
  });
  if (!quoteRes.ok) {
    const body = await quoteRes.text().catch(() => '');
    throw new Error(`Jupiter quote failed: ${quoteRes.status} ${body.slice(0, 300)}`);
  }
  const quote = await quoteRes.json() as { outAmount: string; [key: string]: unknown };

  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  }).catch((err: unknown) => {
    const cause = err instanceof Error ? (err as NodeJS.ErrnoException).cause : undefined;
    throw new Error(`Jupiter swap network error: ${err instanceof Error ? err.message : String(err)}${cause ? ` — cause: ${String(cause)}` : ''}`);
  });
  if (!swapRes.ok) {
    const body = await swapRes.text().catch(() => '');
    throw new Error(`Jupiter swap failed: ${swapRes.status} ${body.slice(0, 300)}`);
  }
  const { swapTransaction } = await swapRes.json() as { swapTransaction: string };

  // 3. Deserialize, sign, send
  const txBytes = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([payer]);
  const rawTx = tx.serialize();

  const sig = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  const solReceived = parseInt(quote.outAmount as string, 10) / 1_000_000_000;

  return {
    inputMint,
    amountIn,
    solReceived,
    txSignature: sig,
  };
}
