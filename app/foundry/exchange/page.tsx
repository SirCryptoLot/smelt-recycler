'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import Link from 'next/link';

const SMELT_MINT     = new PublicKey('SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8');
const VAULT_SMELT_ATA = new PublicKey('9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok');
const DEV_PUBKEY     = new PublicKey('J1aBWq9JmvA4fkqSfV4TthiwkBp5zn5ZZt5D2YSuE3Yw');
const SMELT_DECIMALS = 9;
const INGOTS_PER_SMELT = 1000;
const BUY_TAX_PCT    = 0.05;
const SELL_TAX_PCT   = 0.10;

function fmtNum(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export default function ExchangePage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [ingotBalance, setIngotBalance]   = useState<number | null>(null);
  const [smeltBalance, setSmeltBalance]   = useState<number | null>(null);
  const [buyAmount, setBuyAmount]         = useState('');
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [busy, setBusy]                   = useState(false);
  const [msg, setMsg]                     = useState('');

  const load = useCallback(async () => {
    if (!publicKey) return;
    // Fetch ingot balance from forge API
    const res = await fetch('/api/foundry/forge/1', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setIngotBalance(d.ingotBalance ?? 0);
    }
    // Fetch on-chain SMELT balance
    try {
      const ata = getAssociatedTokenAddressSync(SMELT_MINT, publicKey);
      const acc = await connection.getTokenAccountBalance(ata).catch(() => null);
      setSmeltBalance(acc ? Number(acc.value.uiAmount) : 0);
    } catch {
      setSmeltBalance(0);
    }
  }, [publicKey, connection]);

  useEffect(() => { load(); }, [load]);

  async function handleBuy() {
    if (!publicKey || !sendTransaction) return;
    const smelt = parseFloat(buyAmount);
    if (isNaN(smelt) || smelt <= 0) return;
    setBusy(true);
    setMsg('');
    try {
      const vaultAmt = BigInt(Math.floor(smelt * (1 - BUY_TAX_PCT) * 10 ** SMELT_DECIMALS));
      const devAmt   = BigInt(Math.floor(smelt * BUY_TAX_PCT        * 10 ** SMELT_DECIMALS));
      const userATA  = getAssociatedTokenAddressSync(SMELT_MINT, publicKey);
      const devATA   = getAssociatedTokenAddressSync(SMELT_MINT, DEV_PUBKEY);

      const tx = new Transaction();
      tx.add(createTransferCheckedInstruction(
        userATA, SMELT_MINT, VAULT_SMELT_ATA, publicKey, vaultAmt, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID,
      ));
      if (devAmt > BigInt(0)) {
        // Create dev ATA if it doesn't exist yet (idempotent — safe to include always)
        tx.add(createAssociatedTokenAccountIdempotentInstruction(
          publicKey, devATA, DEV_PUBKEY, SMELT_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        ));
        tx.add(createTransferCheckedInstruction(
          userATA, SMELT_MINT, devATA, publicKey, devAmt, SMELT_DECIMALS, [], TOKEN_PROGRAM_ID,
        ));
      }

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      const apiRes = await fetch('/api/foundry/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'buy',
          wallet: publicKey.toBase58(),
          txSig: sig,
          smeltAmount: smelt,
        }),
      });
      const d = await apiRes.json();
      if (!apiRes.ok) throw new Error(d.error);

      const ingotsReceived = Math.floor(smelt * INGOTS_PER_SMELT);
      setMsg(`✅ Bought ${ingotsReceived.toLocaleString()} Ingots!`);
      setIngotBalance(d.ingotBalance);
      setBuyAmount('');
      await load();
    } catch (e: unknown) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCashout() {
    if (!publicKey) return;
    const ingots = parseInt(cashoutAmount, 10);
    if (isNaN(ingots) || ingots <= 0) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/foundry/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cashout',
          wallet: publicKey.toBase58(),
          ingots,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      const smeltOut = fmtNum((ingots / INGOTS_PER_SMELT) * (1 - SELL_TAX_PCT));
      setMsg(`✅ Cashed out! You receive ${smeltOut} SMELT. Tx: ${String(d.txSig).slice(0, 8)}…`);
      setCashoutAmount('');
      await load();
    } catch (e: unknown) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setBusy(false);
    }
  }

  const buyIngots   = parseFloat(buyAmount) > 0
    ? Math.floor(parseFloat(buyAmount) * INGOTS_PER_SMELT)
    : 0;
  const cashoutSmelt = parseInt(cashoutAmount, 10) > 0
    ? (parseInt(cashoutAmount, 10) / INGOTS_PER_SMELT) * (1 - SELL_TAX_PCT)
    : 0;

  return (
    <div className="min-h-screen bg-[#0d0a04] text-amber-100 p-4 max-w-md mx-auto">
      <Link href="/foundry" className="text-amber-400 underline text-sm">← World Map</Link>

      <h1 className="text-xl font-bold text-amber-300 mt-4 mb-1">⚗️ Ingot Exchange</h1>
      <p className="text-xs text-[#6b4f2a] mb-6">Convert SMELT tokens ↔ Ingots (in-game currency)</p>

      {/* Rate info */}
      <div className="rounded-xl border border-[#3d2b0f] bg-[#1a1208] p-4 mb-4 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-[#92724a]">Rate</span>
          <span>1 SMELT = {INGOTS_PER_SMELT.toLocaleString()} Ingots</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-[#92724a]">Buy-in tax</span>
          <span>{BUY_TAX_PCT * 100}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#92724a]">Cashout tax</span>
          <span>{SELL_TAX_PCT * 100}%</span>
        </div>
      </div>

      {/* Balances */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 rounded-xl border border-[#3d2b0f] bg-[#1a1208] p-3 text-center">
          <div className="text-xs text-[#6b4f2a] mb-1">Your Ingots</div>
          <div className="text-lg font-bold text-amber-300">
            {ingotBalance !== null ? ingotBalance.toLocaleString() : '…'}
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-[#3d2b0f] bg-[#1a1208] p-3 text-center">
          <div className="text-xs text-[#6b4f2a] mb-1">Your SMELT</div>
          <div className="text-lg font-bold text-amber-300">
            {smeltBalance !== null ? fmtNum(smeltBalance) : '…'}
          </div>
        </div>
      </div>

      {/* Buy section */}
      <div className="rounded-xl border border-amber-700 bg-[#1a1208] p-4 mb-4">
        <h2 className="font-bold text-amber-300 mb-3">🔁 Buy Ingots with SMELT</h2>
        <input
          type="number" min="0" step="0.01"
          value={buyAmount}
          onChange={e => setBuyAmount(e.target.value)}
          placeholder="SMELT amount"
          className="w-full bg-[#0f0c06] border border-[#3d2b0f] rounded px-3 py-2 text-sm text-amber-100 mb-2"
        />
        {buyIngots > 0 && (
          <p className="text-xs text-[#92724a] mb-3">
            → You receive: <span className="text-amber-300 font-bold">{buyIngots.toLocaleString()} Ingots</span>
            <span className="ml-1">(5% tax)</span>
          </p>
        )}
        <button
          onClick={handleBuy}
          disabled={busy || !publicKey || parseFloat(buyAmount) <= 0}
          className="w-full py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Processing…' : 'Buy Ingots'}
        </button>
        {!publicKey && (
          <p className="text-xs text-[#6b4f2a] mt-2 text-center">Connect wallet to buy</p>
        )}
      </div>

      {/* Cashout section */}
      <div className="rounded-xl border border-[#3d2b0f] bg-[#1a1208] p-4 mb-4">
        <h2 className="font-bold text-amber-300 mb-3">💰 Cash Out Ingots for SMELT</h2>
        <input
          type="number" min="0" step="1"
          value={cashoutAmount}
          onChange={e => setCashoutAmount(e.target.value)}
          placeholder="Ingots to redeem"
          className="w-full bg-[#0f0c06] border border-[#3d2b0f] rounded px-3 py-2 text-sm text-amber-100 mb-2"
        />
        {cashoutSmelt > 0 && (
          <p className="text-xs text-[#92724a] mb-3">
            → You receive: <span className="text-amber-300 font-bold">{fmtNum(cashoutSmelt)} SMELT</span>
            <span className="ml-1">(10% tax)</span>
          </p>
        )}
        <button
          onClick={handleCashout}
          disabled={busy || !publicKey || parseInt(cashoutAmount, 10) <= 0}
          className="w-full py-2 rounded-lg bg-[#2d1805] hover:bg-[#3d2508] border border-amber-700 text-amber-400 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Processing…' : 'Cash Out SMELT'}
        </button>
        {!publicKey && (
          <p className="text-xs text-[#6b4f2a] mt-2 text-center">Connect wallet to cash out</p>
        )}
      </div>

      {msg && (
        <p className="text-sm text-center mt-2 px-2">{msg}</p>
      )}
    </div>
  );
}
