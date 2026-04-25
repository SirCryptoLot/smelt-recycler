// app/foundry/store/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { StoreResponse } from '@/app/api/foundry/store/route';
import type { ItemId } from '@/lib/foundry-items';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtExpiry(iso: string): string {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  if (secs === 0) return 'Expired';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m left`;
}

function isHornActive(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) > new Date();
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StorePage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [storeData, setStoreData] = useState<StoreResponse | null>(null);
  const [smeltBalance, setSmeltBalance] = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState<ItemId | null>(null);
  const [msg, setMsg]             = useState('');
  const [valueInput, setValueInput] = useState('');

  const fetchStore = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/foundry/store${wallet ? `?wallet=${wallet}` : ''}`);
      const json = await res.json() as StoreResponse;
      setStoreData(json);

      // Also fetch forge SMELT balance if forge known
      if (json.forgeId) {
        const fr = await fetch(`/api/foundry/forge/${json.forgeId}`);
        if (fr.ok) {
          const fd = await fr.json();
          setSmeltBalance(fd.smeltBalance ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchStore(); }, [fetchStore]);

  async function handleBuy(itemId: ItemId) {
    if (!wallet || !storeData?.forgeId) return;
    setBuying(itemId);
    setMsg('');
    try {
      const res = await fetch('/api/foundry/store/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, wallet, value: valueInput || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? 'Failed'); return; }
      setMsg(`✓ ${itemId.replace(/_/g, ' ')} purchased!`);
      setSmeltBalance(data.smeltBalance);
      setValueInput('');
      fetchStore();
    } finally {
      setBuying(null);
    }
  }

  const owned = storeData?.ownedItems;

  function ownedCount(itemId: ItemId): number {
    if (!owned) return 0;
    if (itemId === 'lightning_rod')   return owned.lightningRods;
    if (itemId === 'crystal_bellows') return owned.crystalBellows;
    if (itemId === 'iron_shield')     return owned.ironShieldsBought;
    return 0;
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">⚗️ Forge Store</h1>
          <p className="text-gray-400 text-sm mt-0.5">Spend SMELT. Burn permanently. Gain power.</p>
        </div>
        <Link href="/foundry" className="text-xs text-gray-400 hover:underline">← Back to map</Link>
      </div>

      {/* Wallet / balance bar */}
      {!connected ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-6 text-center space-y-3 mb-6">
          <p className="text-gray-500 text-sm">Connect your wallet to purchase items</p>
          <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm" />
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
          {storeData?.forgeId ? (
            <>
              <span className="text-sm text-amber-800">
                ⚒ <Link href={`/foundry/forge/${storeData.forgeId}`} className="font-bold hover:underline">
                  Forge #{storeData.forgeId}
                </Link>
              </span>
              <span className="text-sm font-bold text-amber-700">
                {smeltBalance !== null ? `${smeltBalance.toLocaleString()} SMELT` : '…'}
              </span>
            </>
          ) : (
            <span className="text-sm text-amber-700">No forge — <Link href="/foundry" className="underline">claim one</Link> to buy items</span>
          )}
        </div>
      )}

      {msg && (
        <div className={`rounded-xl px-4 py-2 text-sm mb-4 ${msg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {msg}
        </div>
      )}

      {/* Item grid */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {storeData?.items.map(item => {
            const isWH      = item.id === 'war_horn';
            const isNP      = item.id === 'nameplate';
            const isBN      = item.id === 'banner';
            const hornOn    = isWH && owned && isHornActive(owned.warHornExpiresAt);
            const atCap     = item.cap !== null && ownedCount(item.id) >= item.cap;
            const noForge   = !storeData.forgeId;
            const isBuying  = buying === item.id;
            const needsInput = isNP || isBN;

            return (
              <div key={item.id} className="rounded-2xl border border-stone-100 bg-white p-4 flex gap-4 items-start">
                <span className="text-2xl flex-shrink-0">{item.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-gray-900 text-sm">{item.label}</span>
                    {item.cap !== null && (
                      <span className="text-[10px] text-gray-400">{ownedCount(item.id)}/{item.cap}</span>
                    )}
                    {isWH && hornOn && owned?.warHornExpiresAt && (
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                        Active · {fmtExpiry(owned.warHornExpiresAt)}
                      </span>
                    )}
                    {item.id === 'iron_shield' && owned && storeData?.forgeId && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        ownedCount('iron_shield') > 0 ? 'bg-blue-50 text-blue-700' : ''
                      }`}>
                        {ownedCount('iron_shield') > 0 ? `${ownedCount('iron_shield')} bought` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{item.description}</p>

                  {/* Value inputs for nameplate/banner */}
                  {needsInput && buying === item.id && (
                    <input
                      type="text"
                      value={valueInput}
                      onChange={e => setValueInput(e.target.value)}
                      placeholder={isNP ? 'Forge name (max 20 chars)' : '#rrggbb'}
                      maxLength={isNP ? 20 : 7}
                      className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm mb-2"
                      autoFocus
                    />
                  )}
                </div>

                <button
                  onClick={() => {
                    if (needsInput && buying !== item.id) {
                      setBuying(item.id); // show input first
                      return;
                    }
                    handleBuy(item.id);
                  }}
                  disabled={!connected || noForge || atCap || (isBuying && !needsInput)}
                  className="flex-shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold px-3 py-2 text-xs transition-colors whitespace-nowrap"
                >
                  {isBuying && !needsInput
                    ? '…'
                    : atCap
                    ? 'Maxed'
                    : `${item.cost.toLocaleString()} SMELT`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
