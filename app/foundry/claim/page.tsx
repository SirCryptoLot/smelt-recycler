// app/foundry/claim/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import { createBurnCheckedInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Link from 'next/link';
import { SMELT_MINT } from '@/lib/constants';

const SMELT_CLAIM_COST = 5_000;
const SMELT_DECIMALS = 9;

export default function ClaimForgePage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const wallet = publicKey?.toBase58() ?? '';

  const [claiming, setClaiming]        = useState(false);
  const [claimError, setClaimError]    = useState('');
  const [claimSuccess, setClaimSuccess] = useState<{ plotId: number; inscription: string } | null>(null);
  const [nextPlotId, setNextPlotId]    = useState<number | null>(null);
  const [alreadyOwns, setAlreadyOwns] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch('/api/foundry');
      const data = await res.json();
      const mine = data.plots?.find((p: { owner: string | null }) => p.owner === wallet);
      if (mine) { setAlreadyOwns(true); return; }
      const next = data.plots?.find((p: { owner: string | null }) => !p.owner);
      setNextPlotId(next?.id ?? null);
    } catch { /* ignore */ }
  }, [wallet]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  async function handleClaim() {
    if (!publicKey || !signTransaction) return;
    setClaiming(true);
    setClaimError('');
    try {
      const userATA = await getAssociatedTokenAddress(SMELT_MINT, publicKey, false, TOKEN_PROGRAM_ID);
      const burnAmount = BigInt(SMELT_CLAIM_COST) * BigInt(10 ** SMELT_DECIMALS);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(createBurnCheckedInstruction(userATA, SMELT_MINT, publicKey, burnAmount, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID));
      const signed = await signTransaction(tx);
      const txSig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed');
      const res = await fetch('/api/foundry/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, txSignature: txSig }),
      });
      const data = await res.json();
      if (!res.ok) { setClaimError(data.error ?? 'Claim failed'); return; }
      setClaimSuccess({ plotId: data.plotId, inscription: data.inscription });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('user rejected')) {
        setClaimError('Transaction cancelled.');
      } else {
        setClaimError(msg);
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e8d5a3] font-serif flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <Link href="/foundry" className="text-amber-600 text-xs hover:text-amber-400">← World Map</Link>
          <h1 className="text-2xl font-extrabold text-amber-400 mt-2">⚒ Claim a Forge</h1>
          <p className="text-[#92724a] text-sm mt-1">Own a permanent forge plot. Earn 1.25× SMELT forever.</p>
        </div>

        {claimSuccess ? (
          <div className="rounded-2xl border border-green-700 bg-[#0a1a0a] px-5 py-4 space-y-2">
            <div className="text-green-400 font-bold">✓ Forge #{claimSuccess.plotId} is yours!</div>
            <div className="text-xs text-green-300 italic leading-relaxed">{claimSuccess.inscription}</div>
            <Link href={`/foundry/forge/${claimSuccess.plotId}`}
              className="block mt-3 text-center bg-[#1a2e12] border border-green-700 text-green-400 text-sm font-bold rounded-xl py-2 hover:border-green-500">
              Manage Your Forge →
            </Link>
          </div>
        ) : alreadyOwns ? (
          <div className="rounded-xl border border-[#3d2b0f] bg-[#140e04] px-4 py-4 text-sm text-amber-300">
            You already own a forge.{' '}
            <Link href="/foundry" className="underline text-amber-400">View it on the map.</Link>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[#3d2b0f] bg-[#140e04] px-4 py-4 space-y-2">
              <div className="text-amber-300 font-semibold text-sm">Cost: {SMELT_CLAIM_COST.toLocaleString()} SMELT</div>
              <div className="text-[#92724a] text-xs">Burned permanently on-chain. You receive a permanent 1.25× SMELT multiplier on every recycle.</div>
              {nextPlotId && <div className="text-[#6b4f2a] text-xs">You will receive Forge #{nextPlotId}.</div>}
            </div>

            {claimError && (
              <div className="rounded-xl border border-red-800 bg-[#1a0505] px-4 py-3 text-sm text-red-400">{claimError}</div>
            )}

            {connected ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
              >
                {claiming && (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {claiming ? 'Burning SMELT…' : `Burn ${SMELT_CLAIM_COST.toLocaleString()} SMELT · Claim Forge`}
              </button>
            ) : (
              <div className="space-y-2">
                <WalletMultiButton className="!w-full !bg-green-700 !text-white !font-bold !rounded-xl !px-4 !py-3 !h-auto !text-sm !justify-center" />
                <p className="text-xs text-[#6b4f2a] text-center">Connect wallet to claim</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
