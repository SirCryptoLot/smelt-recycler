'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { GameNav } from '@/components/foundry/GameNav';

const SMELT_MINT      = new PublicKey('SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8');
const VAULT_SMELT_ATA = new PublicKey('9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok');
const DEV_PUBKEY      = new PublicKey('J1aBWq9JmvA4fkqSfV4TthiwkBp5zn5ZZt5D2YSuE3Yw');
const SMELT_DECIMALS  = 9;
const INGOTS_PER_SMELT = 1000;
const BUY_TAX_PCT    = 0.05;
const SELL_TAX_PCT   = 0.10;

const BG     = '#0d1409';
const CARD   = '#111a09';
const BORDER = '#1e2d10';
const GOLD   = '#d4a438';
const DIM    = '#4a6a2a';
const TEXT   = '#d8c89a';
const MUTED  = '#3a5020';

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
  const [dir, setDir]                     = useState<'buy' | 'cashout'>('buy');

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

  const buyIngots = parseFloat(buyAmount) > 0
    ? Math.floor(parseFloat(buyAmount) * INGOTS_PER_SMELT * (1 - BUY_TAX_PCT))
    : 0;
  const cashoutSmelt = parseInt(cashoutAmount, 10) > 0
    ? (parseInt(cashoutAmount, 10) / INGOTS_PER_SMELT) * (1 - SELL_TAX_PCT)
    : 0;

  const isBuyDisabled  = busy || !publicKey || !(parseFloat(buyAmount) > 0);
  const isCashDisabled = busy || !publicKey || !(parseInt(cashoutAmount, 10) > 0);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'inherit' }}>
      {/* Dark header */}
      <div style={{ background: 'rgba(0,0,0,0.85)', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>⚗️</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>Ingot Exchange</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ background: '#1e2d10', border: `1px solid ${BORDER}`, borderRadius: 9999, padding: '3px 10px', fontSize: 12, color: GOLD }}>
            {ingotBalance !== null ? `${ingotBalance.toLocaleString()} Ingots` : '…'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 96px' }}>

        {/* Balance chips row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: DIM, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SMELT</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>
              {smeltBalance !== null ? fmtNum(smeltBalance) : '…'}
            </div>
          </div>
          <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: DIM, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingots</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>
              {ingotBalance !== null ? ingotBalance.toLocaleString() : '…'}
            </div>
          </div>
        </div>

        {/* Swap card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>

          {/* Direction tabs */}
          <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 12, margin: '14px 14px 0 14px', overflow: 'hidden' }}>
            <button
              onClick={() => setDir('buy')}
              style={{
                flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: dir === 'buy' ? CARD : 'transparent',
                border: 'none',
                borderRight: `1px solid ${BORDER}`,
                color: dir === 'buy' ? GOLD : MUTED,
                borderRadius: 0,
              }}
            >
              SMELT → Ingots
            </button>
            <button
              onClick={() => setDir('cashout')}
              style={{
                flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: dir === 'cashout' ? CARD : 'transparent',
                border: 'none',
                color: dir === 'cashout' ? GOLD : MUTED,
                borderRadius: 0,
              }}
            >
              Ingots → SMELT
            </button>
          </div>

          <div style={{ padding: '14px' }}>
            {dir === 'buy' ? (
              <>
                <input
                  type="number" min="0" step="0.01"
                  value={buyAmount}
                  onChange={e => setBuyAmount(e.target.value)}
                  placeholder="SMELT amount"
                  style={{ background: '#080c05', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', fontSize: 20, color: TEXT, width: '100%', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 13, color: DIM, marginTop: 8, minHeight: 20 }}>
                  {buyIngots > 0 && (
                    <>→ You receive <span style={{ color: GOLD, fontWeight: 700 }}>{buyIngots.toLocaleString()} Ingots</span> <span style={{ color: MUTED }}>(5% tax)</span></>
                  )}
                </div>
                <button
                  onClick={handleBuy}
                  disabled={isBuyDisabled}
                  style={{
                    marginTop: 10, width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: isBuyDisabled ? 'not-allowed' : 'pointer',
                    background: isBuyDisabled ? '#0e1408' : '#2d4a10',
                    border: `1px solid ${isBuyDisabled ? '#1a2810' : '#4a7a20'}`,
                    color: isBuyDisabled ? '#2a3d18' : '#90d050',
                  }}
                >
                  {busy ? 'Processing…' : 'Buy Ingots'}
                </button>
                {!publicKey && <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 8 }}>Connect wallet to buy</p>}
              </>
            ) : (
              <>
                <input
                  type="number" min="0" step="1"
                  value={cashoutAmount}
                  onChange={e => setCashoutAmount(e.target.value)}
                  placeholder="Ingots to redeem"
                  style={{ background: '#080c05', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', fontSize: 20, color: TEXT, width: '100%', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 13, color: DIM, marginTop: 8, minHeight: 20 }}>
                  {cashoutSmelt > 0 && (
                    <>→ You receive <span style={{ color: GOLD, fontWeight: 700 }}>{fmtNum(cashoutSmelt)} SMELT</span> <span style={{ color: MUTED }}>(10% tax)</span></>
                  )}
                </div>
                <button
                  onClick={handleCashout}
                  disabled={isCashDisabled}
                  style={{
                    marginTop: 10, width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: isCashDisabled ? 'not-allowed' : 'pointer',
                    background: isCashDisabled ? '#0e1408' : '#1a3a10',
                    border: `1px solid ${isCashDisabled ? '#1a2810' : '#2a6010'}`,
                    color: isCashDisabled ? '#2a3d18' : '#70c030',
                  }}
                >
                  {busy ? 'Processing…' : 'Cash Out SMELT'}
                </button>
                {!publicKey && <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 8 }}>Connect wallet to cash out</p>}
              </>
            )}
          </div>
        </div>

        {/* Rate info */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11, color: DIM, marginBottom: 16 }}>
          <span>1 SMELT = {INGOTS_PER_SMELT.toLocaleString()} Ingots</span>
          <span style={{ color: MUTED }}>·</span>
          <span>{BUY_TAX_PCT * 100}% buy tax</span>
          <span style={{ color: MUTED }}>·</span>
          <span>{SELL_TAX_PCT * 100}% cashout tax</span>
        </div>

        {/* Status banner */}
        {msg && (
          <div style={{
            background: msg.startsWith('✅') ? '#0e1e0e' : '#1a0e0e',
            border: `1px solid ${msg.startsWith('✅') ? '#2a5a2a' : '#5a2a2a'}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13, color: msg.startsWith('✅') ? '#70c070' : '#e06060', textAlign: 'center',
          }}>
            {msg}
          </div>
        )}
      </div>

      <GameNav />
    </div>
  );
}
