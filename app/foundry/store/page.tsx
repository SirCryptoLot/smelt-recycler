// app/foundry/store/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { GameNav } from '@/components/foundry/GameNav';
import type { StoreResponse } from '@/app/api/foundry/store/route';
import type { ItemId } from '@/lib/foundry-items';

const BG     = '#0d1409';
const CARD   = '#111a09';
const BORDER = '#1e2d10';
const GOLD   = '#d4a438';
const DIM    = '#4a6a2a';
const TEXT   = '#d8c89a';
const MUTED  = '#3a5020';

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
  const [ingotBalance, setIngotBalance] = useState<number | null>(null);
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
          setIngotBalance(fd.ingotBalance ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchStore(); }, [fetchStore]);

  async function handleBuy(itemId: ItemId) {
    if (!wallet || !storeData?.forgeId) return;
    const needsVal = itemId === 'nameplate' || itemId === 'banner';
    if (needsVal && !valueInput.trim()) {
      setMsg(itemId === 'nameplate' ? 'Enter a forge name first' : 'Enter a hex color first (#rrggbb)');
      return;
    }
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
      setIngotBalance(data.ingotBalance);
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
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'inherit' }}>
      {/* Dark header */}
      <div style={{ background: 'rgba(0,0,0,0.85)', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🛒</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>Forge Store</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ background: '#1e2d10', border: `1px solid ${BORDER}`, borderRadius: 9999, padding: '3px 10px', fontSize: 12, color: GOLD }}>
            {ingotBalance !== null ? `${ingotBalance.toLocaleString()} Ingots` : '…'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 96px' }}>

        {/* Not connected */}
        {!connected && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 16 }}>Connect your wallet to purchase items</p>
            <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm" />
          </div>
        )}

        {/* Connected but no forge */}
        {connected && !loading && storeData && !storeData.forgeId && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ color: DIM, fontSize: 14 }}>
              No forge —{' '}
              <Link href="/foundry" style={{ color: GOLD, textDecoration: 'underline' }}>claim one</Link>
              {' '}first
            </p>
          </div>
        )}

        {/* Message banner */}
        {msg && (
          <div style={{
            background: msg.startsWith('✓') ? '#0e1e0e' : '#1a0e0e',
            border: `1px solid ${msg.startsWith('✓') ? '#2a5a2a' : '#5a2a2a'}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13,
            color: msg.startsWith('✓') ? '#70c070' : '#e06060',
            marginBottom: 12,
          }}>
            {msg}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, height: 64, opacity: 0.5 }} />
            ))}
          </div>
        )}

        {/* Items list */}
        {!loading && storeData?.items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {storeData.items.map(item => {
              const isWH      = item.id === 'war_horn';
              const isNP      = item.id === 'nameplate';
              const isBN      = item.id === 'banner';
              const hornOn    = isWH && owned && isHornActive(owned.warHornExpiresAt);
              const atCap     = item.cap !== null && ownedCount(item.id) >= item.cap;
              const noForge   = !storeData.forgeId;
              const isBuying  = buying === item.id;
              const needsInput = isNP || isBN;
              const btnDisabled = !connected || noForge || atCap || isBuying;

              return (
                <div
                  key={item.id}
                  style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}
                >
                  {/* Icon */}
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{item.label}</span>
                      {item.cap !== null && (
                        <span style={{ fontSize: 10, color: DIM }}>{ownedCount(item.id)}/{item.cap}</span>
                      )}
                      {isWH && hornOn && owned?.warHornExpiresAt && (
                        <span style={{ background: '#3d2808', color: '#e8a020', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                          Active · {fmtExpiry(owned.warHornExpiresAt)}
                        </span>
                      )}
                      {item.id === 'iron_shield' && owned && storeData?.forgeId && ownedCount('iron_shield') > 0 && (
                        <span style={{ background: '#0a1a2a', color: '#60a0d0', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                          {ownedCount('iron_shield')} bought
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: MUTED, marginTop: 2, marginBottom: needsInput && buying === item.id ? 6 : 0 }}>{item.description}</p>

                    {/* Value input for nameplate/banner */}
                    {needsInput && buying === item.id && (
                      <input
                        type="text"
                        value={valueInput}
                        onChange={e => setValueInput(e.target.value)}
                        placeholder={isNP ? 'Forge name (max 20 chars)' : '#rrggbb'}
                        maxLength={isNP ? 20 : 7}
                        autoFocus
                        style={{
                          background: '#080c05', border: `1px solid ${BORDER}`, borderRadius: 8,
                          padding: '7px 10px', fontSize: 13, color: TEXT, outline: 'none',
                          width: '100%', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>

                  {/* Buy button */}
                  <button
                    onClick={() => {
                      if (needsInput && buying !== item.id) {
                        setBuying(item.id);
                        return;
                      }
                      handleBuy(item.id);
                    }}
                    disabled={btnDisabled}
                    style={{
                      flexShrink: 0, borderRadius: 10, padding: '6px 12px', fontSize: 11, fontWeight: 700,
                      cursor: btnDisabled ? 'not-allowed' : 'pointer',
                      background: atCap || !connected || noForge ? '#0e1408' : '#2d4a10',
                      border: `1px solid ${atCap || !connected || noForge ? '#1a2810' : '#4a7a20'}`,
                      color: atCap || !connected || noForge ? '#2a3d18' : '#90d050',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isBuying && !needsInput
                      ? '…'
                      : atCap
                      ? 'Maxed'
                      : `${item.cost.toLocaleString()} Ingots`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GameNav forgeId={storeData?.forgeId ?? null} />
    </div>
  );
}
