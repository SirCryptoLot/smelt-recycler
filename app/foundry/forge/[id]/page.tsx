// app/foundry/forge/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ForgeStateResponse } from '@/app/api/foundry/forge/[id]/route';
import {
  BUILDING_META, ALL_BUILDINGS, buildCost, BuildingType,
  TROOP_META, ALL_TROOPS, TroopType,
  TroopCount, TrainingItem, AttackRecord,
} from '@/lib/foundry-constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('en-US'); }

function fmtCountdown(isoEnd: string): string {
  const secs = Math.max(0, Math.floor((new Date(isoEnd).getTime() - Date.now()) / 1000));
  if (secs === 0) return 'Done';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ forgeId }: { forgeId: number }) {
  const items = [
    { label: 'Map',      icon: '🗺',  href: '/foundry' },
    { label: 'Reports',  icon: '📋',  href: '/foundry/reports' },
    { label: 'Exchange', icon: '⚗️',  href: '/foundry/exchange' },
    { label: 'Store',    icon: '🏪',  href: '/foundry/store' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex"
      style={{ background: 'rgba(5,10,3,0.97)', borderTop: '1px solid #2a3d1a', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map(({ label, icon, href }) => (
        <Link key={label} href={href}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-opacity active:opacity-60"
          style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 10, color: '#5a7a3a', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ForgePage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [state, setState]       = useState<ForgeStateResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState('');
  const [trainQty, setTrainQty] = useState<Record<TroopType, number>>({
    smelters: 1, ash_archers: 1, iron_guards: 1,
  });
  const [attackTarget, setAttackTarget] = useState('');
  const [sendQty, setSendQty]           = useState<Record<TroopType, number>>({
    smelters: 0, ash_archers: 0, iron_guards: 0,
  });
  const [attackMsg, setAttackMsg] = useState('');
  const [, setTick] = useState(0);

  const fetchState = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/foundry/forge/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to load forge');
      } else {
        setState(await res.json());
      }
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchState(); }, [fetchState]);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const isOwner      = !!wallet && state?.owner === wallet;
  const totalSendQty = sendQty.smelters + sendQty.ash_archers + sendQty.iron_guards;

  async function handleBuild(buildingType: BuildingType) {
    if (!wallet || !state) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forgeId: parseInt(id), buildingType, wallet }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(d.instant
        ? `✅ ${BUILDING_META[buildingType].label} upgraded to Lv${d.toLevel}!`
        : `🔨 Upgrading ${BUILDING_META[buildingType].label} to Lv${d.toLevel}…`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleTrain(troopType: TroopType) {
    if (!wallet || !state) return;
    const quantity = trainQty[troopType];
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forgeId: parseInt(id), troopType, quantity, wallet }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(`⚔️ Training ${quantity}× ${TROOP_META[troopType].label}…`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleAttack() {
    if (!wallet) { setAttackMsg('Connect wallet first'); return; }
    const forgeId  = parseInt(id, 10);
    const targetId = parseInt(attackTarget, 10);
    if (isNaN(targetId) || targetId < 1 || targetId > 500) {
      setAttackMsg('Enter a valid target forge ID (1–500)'); return;
    }
    if (totalSendQty === 0) { setAttackMsg('Select at least 1 troop'); return; }
    setBusy(true); setAttackMsg('');
    try {
      const res = await fetch('/api/foundry/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackerForgeId: forgeId, defenderForgeId: targetId, troops: sendQty, wallet }),
      });
      const data = await res.json();
      if (!res.ok) { setAttackMsg(data.error ?? 'Failed'); return; }
      setAttackMsg(`⚔️ Attack launched! Arrives in ~${data.travelMins} min`);
      setSendQty({ smelters: 0, ash_archers: 0, iron_guards: 0 });
      fetchState();
    } finally { setBusy(false); }
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#d4a438', fontSize: 14, fontWeight: 700 }}>Loading forge…</span>
    </div>
  );
  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0d1408', padding: '48px 16px' }}>
      <p style={{ color: '#e05050', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠ {error}</p>
      <Link href="/foundry" style={{ color: '#d4a438', fontSize: 13 }}>← Back to map</Link>
    </div>
  );
  if (!state) return null;

  // ── Derived values ──────────────────────────────────────────────────────────

  const totalStationed = state.troops.smelters + state.troops.ash_archers + state.troops.iron_guards;
  const builtCount     = ALL_BUILDINGS.filter(b => (state.buildings[b] ?? 0) > 0).length;
  const avgLevel       = builtCount === 0 ? 0
    : Math.round(ALL_BUILDINGS.reduce((s, b) => s + (state.buildings[b] ?? 0), 0) / ALL_BUILDINGS.length * 10) / 10;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0d1408', color: '#e8d5a3', fontFamily: 'sans-serif', paddingBottom: 80 }}>

      {/* ── Hero header — white → dark gradient ── */}
      <div style={{
        background: 'linear-gradient(to bottom, #ffffff 0%, #f5f0e8 18%, #c8a84a 42%, #6b3d10 62%, #1e2e10 78%, #0d1408 100%)',
        padding: '24px 20px 32px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Forge icon circle */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px',
          background: 'linear-gradient(135deg, #2d1a06 0%, #5a3010 50%, #2d1a06 100%)',
          border: '2px solid #c8a84a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
          boxShadow: '0 0 24px rgba(200,168,74,0.35)',
        }}>
          ⚒
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#f5d060', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Forge #{state.forgeId}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(200,168,74,0.6)', marginTop: 4, wordBreak: 'break-all', maxWidth: 280, margin: '4px auto 0' }}>
          {state.owner.slice(0, 8)}…{state.owner.slice(-4)}
        </div>

        {/* Stat chips row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {[
            { val: fmt(state.ingotBalance), label: '💰 Ingots', accent: '#f5d060' },
            { val: builtCount,             label: '🏗 Built',   accent: '#90c060' },
            { val: totalStationed,         label: '⚔️ Troops',  accent: '#c07050' },
          ].map(({ val, label, accent }) => (
            <div key={label} style={{
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '6px 12px',
              textAlign: 'center',
              backdropFilter: 'blur(4px)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: accent, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 2, letterSpacing: '0.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Page content ── */}
      <div style={{ maxWidth: 672, margin: '0 auto', padding: '16px 16px 8px' }}>

        {/* Status banners */}
        {msg && (
          <div style={{ background: '#1a2a10', border: '1px solid #4a6a2a', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#b0d080', marginBottom: 12 }}>
            {msg}
          </div>
        )}
        {state.construction && (
          <div style={{ background: '#1e1a08', border: '1px solid #6a4a10', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#e8c060', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔨</span>
            <span>
              Upgrading <strong>{BUILDING_META[state.construction.buildingType as BuildingType].label}</strong> to Lv{state.construction.toLevel}
              {' — '}<span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtCountdown(state.construction.completesAt)}</span> remaining
            </span>
          </div>
        )}

        {/* ── Buildings ── */}
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4a6a2a', marginBottom: 10 }}>
          Buildings
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}
          className="sm:grid-cols-4">
          {ALL_BUILDINGS.map(type => {
            const meta       = BUILDING_META[type];
            const level      = state.buildings[type] ?? 0;
            const toLevel    = level + 1;
            const cost       = level < 5 ? buildCost(type, toLevel) : 0;
            const isBuilding = state.construction?.buildingType === type;
            const canUpgrade = isOwner && level < 5 && !state.construction && state.ingotBalance >= cost && !busy;
            const pct        = (level / 5) * 100;

            return (
              <div key={type} style={{
                background: isBuilding ? '#1e1a08' : '#111a08',
                border: `1px solid ${isBuilding ? '#6a4a10' : '#2a3d1a'}`,
                borderRadius: 14,
                padding: 12,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{meta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#d4c090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#4a6a2a' }}>Lv {level} / 5</div>
                  </div>
                </div>

                <div style={{ height: 3, borderRadius: 2, background: '#1e2d10' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: 'linear-gradient(90deg, #b45309, #f59e0b)', transition: 'width 0.4s' }} />
                </div>

                <div style={{ fontSize: 9, color: '#3a5a20', lineHeight: 1.4 }}>{meta.effectLabel}</div>

                {level >= 5 ? (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#d4a438', textAlign: 'center' }}>MAX</div>
                ) : isBuilding ? (
                  <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', background: '#1a1508', borderRadius: 8, padding: '4px 0', color: '#e8a020' }}>
                    {fmtCountdown(state.construction!.completesAt)}
                  </div>
                ) : isOwner ? (
                  <button onClick={() => handleBuild(type)} disabled={!canUpgrade}
                    style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '6px 0', width: '100%', cursor: canUpgrade ? 'pointer' : 'not-allowed',
                      background: canUpgrade ? '#2d4a10' : '#141d0a',
                      border: `1px solid ${canUpgrade ? '#4a7a20' : '#2a3510'}`,
                      color: canUpgrade ? '#b0d060' : '#3a4a28',
                      transition: 'background 0.15s',
                    }}>
                    {level === 0 ? 'Build' : 'Upgrade'} — {fmt(cost)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── Troops ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4a6a2a' }}>Troops</div>
          <span style={{ fontSize: 10, color: '#3a5a20' }}>{totalStationed} / {state.troopCapacity} stationed</span>
          {state.buildings['barracks'] < 1 && isOwner && (
            <span style={{ fontSize: 10, color: '#c07020' }}>— build Barracks first</span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 10, marginBottom: 20 }}
          className="sm:grid-cols-3">
          {ALL_TROOPS.map(type => {
            const meta     = TROOP_META[type];
            const qty      = trainQty[type];
            const cost     = meta.cost * qty;
            const canTrain = isOwner && state.buildings['barracks'] >= 1 && state.ingotBalance >= cost && !busy;

            return (
              <div key={type} style={{ background: '#111a08', border: '1px solid #2a3d1a', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#d4c090' }}>{meta.label}</div>
                    <div style={{ fontSize: 10, color: '#4a6a2a' }}>
                      Stationed: <strong style={{ color: '#a0c060' }}>{state.troops[type as keyof TroopCount]}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  <div style={{ background: '#1e0d0d', border: '1px solid #3d1515', borderRadius: 8, padding: '4px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e05050' }}>{meta.atk}</div>
                    <div style={{ fontSize: 8, color: '#5a3030' }}>ATK</div>
                  </div>
                  <div style={{ background: '#0d1520', border: '1px solid #152540', borderRadius: 8, padding: '4px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#5090d0' }}>{meta.def}</div>
                    <div style={{ fontSize: 8, color: '#2a4060' }}>DEF</div>
                  </div>
                  <div style={{ background: '#1a1408', border: '1px solid #3a2d10', borderRadius: 8, padding: '4px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#c09030' }}>{meta.cost}</div>
                    <div style={{ fontSize: 8, color: '#4a3a18' }}>each</div>
                  </div>
                </div>

                {isOwner && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" min={1} max={20} value={qty}
                      onChange={e => setTrainQty(q => ({ ...q, [type]: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) }))}
                      style={{ width: 44, background: '#0d1408', border: '1px solid #2a3d1a', borderRadius: 8, padding: '4px 0', fontSize: 10, textAlign: 'center', color: '#d4c090' }}
                    />
                    <button onClick={() => handleTrain(type)} disabled={!canTrain}
                      style={{
                        flex: 1, fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '6px 0', cursor: canTrain ? 'pointer' : 'not-allowed',
                        background: canTrain ? '#1a3010' : '#0d1408',
                        border: `1px solid ${canTrain ? '#3a6020' : '#1e2d10'}`,
                        color: canTrain ? '#90d050' : '#2a3d1a',
                      }}>
                      Train ×{qty} — {fmt(cost)}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Training queue */}
        {state.trainingQueue.length > 0 && (
          <div style={{ background: '#111a08', border: '1px solid #2a3d1a', borderRadius: 14, padding: 12, marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4a6a2a', marginBottom: 8 }}>
              Training Queue
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.trainingQueue.map((item: TrainingItem, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a0b880' }}>
                  <span>{TROOP_META[item.type as TroopType].icon} {item.quantity}× {TROOP_META[item.type as TroopType].label}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d4a438' }}>{fmtCountdown(item.completesAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Attack Panel ── */}
        {state.buildings.rally_point >= 1 && (
          <div style={{ background: '#150d0d', border: '1px solid #4a1a1a', borderRadius: 16, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a2a2a' }}>
              ⚔️ Send Attack
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#806060', width: 110, flexShrink: 0 }}>Target Forge ID</label>
              <input type="number" min={1} max={500} value={attackTarget}
                onChange={e => setAttackTarget(e.target.value)}
                placeholder="e.g. 42"
                style={{ width: 80, background: '#0d0808', border: '1px solid #3a1a1a', borderRadius: 8, padding: '4px 8px', fontSize: 13, textAlign: 'center', color: '#e8c0c0' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALL_TROOPS.map(t => {
                const meta  = TROOP_META[t];
                const avail = state.troops[t];
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, width: 20 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, color: '#806060' }}>{meta.label}</span>
                    <span style={{ fontSize: 11, color: '#5a3a3a' }}>{avail} avail</span>
                    <input type="number" min={0} max={avail} value={sendQty[t]}
                      onChange={e => setSendQty(q => ({ ...q, [t]: Math.min(avail, Math.max(0, Number(e.target.value))) }))}
                      style={{ width: 56, background: '#0d0808', border: '1px solid #3a1a1a', borderRadius: 8, padding: '4px 6px', fontSize: 13, textAlign: 'center', color: '#e8c0c0' }}
                    />
                  </div>
                );
              })}
            </div>

            {attackMsg && (
              <p style={{ fontSize: 12, color: attackMsg.startsWith('⚔️') ? '#80d060' : '#d06060', margin: 0 }}>
                {attackMsg}
              </p>
            )}

            <button onClick={handleAttack} disabled={busy || totalSendQty === 0 || !attackTarget}
              style={{
                fontWeight: 700, borderRadius: 12, padding: '10px 0', fontSize: 13, cursor: (busy || totalSendQty === 0 || !attackTarget) ? 'not-allowed' : 'pointer',
                background: (busy || totalSendQty === 0 || !attackTarget) ? '#1a0d0d' : '#3d1010',
                border: `1px solid ${(busy || totalSendQty === 0 || !attackTarget) ? '#3a1a1a' : '#8b1a1a'}`,
                color: (busy || totalSendQty === 0 || !attackTarget) ? '#4a2a2a' : '#ff8080',
              }}>
              {busy ? 'Sending…' : `Send ${totalSendQty > 0 ? totalSendQty + ' ' : ''}Troops`}
            </button>

            {state.pendingAttacks.length > 0 && (
              <div style={{ borderTop: '1px solid #2a1515', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a2a2a', margin: 0 }}>Outgoing</p>
                {state.pendingAttacks.map((a: AttackRecord) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#806060' }}>
                    <span>→ Forge #{a.defenderForgeId}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e05050' }}>{fmtCountdown(a.arrivesAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Inscription ── */}
        <div style={{ background: '#0d1008', border: '1px solid #1e2d10', borderRadius: 12, padding: '12px 16px', fontSize: 12, fontStyle: 'italic', lineHeight: 1.6, color: '#3a5020' }}>
          {state.inscription}
        </div>

      </div>

      <BottomNav forgeId={state.forgeId} />
    </div>
  );
}
