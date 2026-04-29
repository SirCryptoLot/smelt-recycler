// app/foundry/forge/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ForgeStateResponse, ForgePublicResponse, ForgeViewResponse } from '@/app/api/foundry/forge/[id]/route';
import { GameNav } from '@/components/foundry/GameNav';
import {
  BUILDING_META, ALL_BUILDINGS, buildCost, BuildingType, BUILD_TIME_MINS,
  TROOP_META, ALL_TROOPS, TroopType,
  TroopCount, TrainingItem, AttackRecord,
} from '@/lib/foundry-constants';

function fmt(n: number) { return n.toLocaleString('en-US'); }

function fmtCountdown(isoEnd: string): string {
  const secs = Math.max(0, Math.floor((new Date(isoEnd).getTime() - Date.now()) / 1000));
  if (secs === 0) return 'Done';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type Tab = 'buildings' | 'troops' | 'attack';

// ── Shared tokens ─────────────────────────────────────────────────────────────
const BG    = '#0d1409';
const CARD  = '#111a09';
const BORDER = '#1e2d10';
const GOLD  = '#d4a438';
const DIM   = '#4a6a2a';
const TEXT  = '#d8c89a';
const MUTED = '#3a5020';

export default function ForgePage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [state, setState]   = useState<ForgeViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState('');
  const [tab, setTab]       = useState<Tab>('buildings');
  const [trainQty, setTrainQty] = useState<Record<TroopType, number>>({ smelters: 1, ash_archers: 1, iron_guards: 1 });
  const [attackTarget, setAttackTarget] = useState('');
  const [sendQty, setSendQty] = useState<Record<TroopType, number>>({ smelters: 0, ash_archers: 0, iron_guards: 0 });
  const [attackMsg, setAttackMsg] = useState('');
  const [, setTick] = useState(0);

  const fetchState = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const url = wallet
        ? `/api/foundry/forge/${id}?wallet=${wallet}`
        : `/api/foundry/forge/${id}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); }
      else setState(await res.json());
    } finally { setLoading(false); }
  }, [id, wallet]);

  useEffect(() => { fetchState(); }, [fetchState]);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);

  const isOwner      = !!state && state.isPublic === false;
  const ownerState   = isOwner ? state as ForgeStateResponse : null;
  const publicState  = state?.isPublic ? state as ForgePublicResponse : null;
  const totalSendQty = sendQty.smelters + sendQty.ash_archers + sendQty.iron_guards;

  async function handleBuild(buildingType: BuildingType) {
    if (!wallet || !state) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forgeId: parseInt(id), buildingType, wallet }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(d.instant ? `✅ ${BUILDING_META[buildingType].label} → Lv${d.toLevel}` : `🔨 Upgrading ${BUILDING_META[buildingType].label} to Lv${d.toLevel}…`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleTrain(troopType: TroopType) {
    if (!wallet || !state) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forgeId: parseInt(id), troopType, quantity: trainQty[troopType], wallet }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(`⚔️ Training ${trainQty[troopType]}× ${TROOP_META[troopType].label}…`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleCancelBuild() {
    if (!wallet) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/cancel-build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forgeId: parseInt(id), wallet }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(`↩ ${BUILDING_META[d.buildingType as BuildingType].label} cancelled · refunded ${fmt(d.refunded)} ⚙`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleCancelTrain(completesAt: string) {
    if (!wallet) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/foundry/cancel-train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forgeId: parseInt(id), wallet, completesAt }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`❌ ${d.error}`); return; }
      setMsg(`↩ ${d.quantity}× ${TROOP_META[d.troopType as TroopType].label} cancelled · refunded ${fmt(d.refunded)} ⚙`);
      await fetchState();
    } finally { setBusy(false); }
  }

  async function handleAttack() {
    if (!wallet) { setAttackMsg('Connect wallet first'); return; }
    const targetId = parseInt(attackTarget, 10);
    if (isNaN(targetId) || targetId < 1 || targetId > 500) { setAttackMsg('Enter forge ID (1–500)'); return; }
    if (totalSendQty === 0) { setAttackMsg('Select at least 1 troop'); return; }
    setBusy(true); setAttackMsg('');
    try {
      const res = await fetch('/api/foundry/attack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attackerForgeId: parseInt(id, 10), defenderForgeId: targetId, troops: sendQty, wallet }) });
      const d = await res.json();
      if (!res.ok) { setAttackMsg(d.error ?? 'Failed'); return; }
      setAttackMsg(`⚔️ Launched! ~${d.travelMins} min`);
      setSendQty({ smelters: 0, ash_archers: 0, iron_guards: 0 });
      fetchState();
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontSize: 14, fontWeight: 700 }}>Loading…</div>;
  if (error)   return <div style={{ minHeight: '100vh', background: BG, padding: '48px 20px' }}><p style={{ color: '#e05050', marginBottom: 8 }}>{error}</p><Link href="/foundry" style={{ color: GOLD }}>← Back</Link></div>;
  if (!state)  return null;

  // Non-owner viewing — show a limited "scout" profile, not the full management UI.
  if (state.isPublic) {
    return <PublicForgeProfile state={state} />;
  }

  const totalStationed = state.troops.smelters + state.troops.ash_archers + state.troops.iron_guards;

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'buildings', icon: '🏗️', label: 'Buildings' },
    { id: 'troops',    icon: '⚔️', label: 'Troops' },
    { id: 'attack',    icon: '🗡️', label: 'Attack' },
  ];

  // ── Tab content ─────────────────────────────────────────────────────────────

  function BuildingsTab() {
    const c = state!.construction;
    return (
      <div>
        {c && (
          <QueuePanel title="Construction" iconHex="#e8c060">
            <QueueRow
              icon={BUILDING_META[c.buildingType as BuildingType].icon}
              label={`${BUILDING_META[c.buildingType as BuildingType].label} → Lv ${c.toLevel}`}
              completesAt={c.completesAt}
              startMs={new Date(c.completesAt).getTime() - (BUILD_TIME_MINS[c.toLevel] ?? 0) * 60_000}
              onCancel={isOwner ? handleCancelBuild : undefined}
              busy={busy}
            />
          </QueuePanel>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_BUILDINGS.map(type => {
            const meta       = BUILDING_META[type];
            const level      = state!.buildings[type] ?? 0;
            const cost       = level < 5 ? buildCost(type, level + 1) : 0;
            const isBuilding = state!.construction?.buildingType === type;
            const canUpgrade = isOwner && level < 5 && !state!.construction && state!.ingotBalance >= cost && !busy;

            return (
              <div key={type} style={{ background: isBuilding ? '#1c1608' : CARD, border: `1px solid ${isBuilding ? '#6a4a10' : BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{meta.label}</span>
                    <span style={{ fontSize: 10, color: DIM }}>Lv {level}/5</span>
                  </div>
                  <div style={{ height: 3, background: '#1a2a0e', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(level / 5) * 100}%`, background: 'linear-gradient(90deg,#b45309,#f59e0b)', borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {level >= 5 ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>MAX</span>
                  ) : isBuilding ? (
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#e8a020' }}>{fmtCountdown(state!.construction!.completesAt)}</span>
                  ) : isOwner ? (
                    <button onClick={() => handleBuild(type)} disabled={!canUpgrade}
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '5px 10px', cursor: canUpgrade ? 'pointer' : 'not-allowed', background: canUpgrade ? '#1e3a0e' : '#111808', border: `1px solid ${canUpgrade ? '#3a6a18' : '#1e2a10'}`, color: canUpgrade ? '#90d050' : '#2a3d18', whiteSpace: 'nowrap' }}>
                      {level === 0 ? 'Build' : 'Upgrade'}<br />
                      <span style={{ fontSize: 9, fontWeight: 400 }}>{fmt(cost)} ⚙</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function TroopsTab() {
    const queue = state!.trainingQueue;
    return (
      <div>
        {queue.length > 0 && (
          <QueuePanel title="Training" iconHex="#e8c060">
            {queue.map((item, i) => {
              // Each queue item starts at the previous item's completesAt (or now for the first)
              const prevEnd = i > 0 ? new Date(queue[i - 1].completesAt).getTime() : Date.now();
              const itemEnd = new Date(item.completesAt).getTime();
              const startMs = Math.min(prevEnd, itemEnd);
              return (
                <QueueRow
                  key={item.completesAt}
                  icon={TROOP_META[item.type as TroopType].icon}
                  label={`${item.quantity}× ${TROOP_META[item.type as TroopType].label}`}
                  completesAt={item.completesAt}
                  startMs={startMs}
                  onCancel={isOwner ? () => handleCancelTrain(item.completesAt) : undefined}
                  busy={busy}
                />
              );
            })}
          </QueuePanel>
        )}
        <p style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
          {totalStationed}/{state!.troopCapacity} stationed{state!.buildings['barracks'] < 1 && isOwner ? ' · Build Barracks first' : ''}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_TROOPS.map(type => {
            const meta     = TROOP_META[type];
            const qty      = trainQty[type];
            const cost     = meta.cost * qty;
            const canTrain = isOwner && state!.buildings['barracks'] >= 1 && state!.ingotBalance >= cost && !busy;
            const stationed = state!.troops[type as keyof TroopCount];

            return (
              <div key={type} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isOwner ? 8 : 0 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{meta.label}</span>
                    <span style={{ fontSize: 11, color: '#90c050', marginLeft: 8 }}>{stationed} stationed</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ background: '#1e0d0d', border: '1px solid #3d1515', borderRadius: 6, padding: '3px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e05050', lineHeight: 1 }}>{meta.atk}</div>
                      <div style={{ fontSize: 7, color: '#5a3030' }}>ATK</div>
                    </div>
                    <div style={{ background: '#0d1520', border: '1px solid #152540', borderRadius: 6, padding: '3px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#5090d0', lineHeight: 1 }}>{meta.def}</div>
                      <div style={{ fontSize: 7, color: '#2a4060' }}>DEF</div>
                    </div>
                  </div>
                </div>
                {isOwner && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => setTrainQty(q => ({ ...q, [type]: Math.max(1, q[type] - 1) }))} style={{ width: 28, height: 28, background: '#1a2a10', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#90d050', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, width: 28, textAlign: 'center', flexShrink: 0 }}>{qty}</span>
                    <button onClick={() => setTrainQty(q => ({ ...q, [type]: Math.min(20, q[type] + 1) }))} style={{ width: 28, height: 28, background: '#1a2a10', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#90d050', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>+</button>
                    <button onClick={() => handleTrain(type)} disabled={!canTrain} style={{ flex: 1, fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '6px 0', cursor: canTrain ? 'pointer' : 'not-allowed', background: canTrain ? '#1a3410' : '#0e1408', border: `1px solid ${canTrain ? '#3a6018' : '#1a2410'}`, color: canTrain ? '#90d050' : '#2a3d18' }}>
                      Train ×{qty} · {fmt(cost)} ⚙
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function AttackTab() {
    if (state!.buildings.rally_point < 1) return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: MUTED, fontSize: 13 }}>
        🗺️ Build a <strong style={{ color: DIM }}>Rally Point</strong> to unlock attacks.
      </div>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 10, color: DIM, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target Forge ID</label>
          <input type="number" min={1} max={500} value={attackTarget} onChange={e => setAttackTarget(e.target.value)} placeholder="1 – 500"
            style={{ width: '100%', background: '#080c05', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 14, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_TROOPS.map(t => {
            const avail = state!.troops[t];
            return (
              <div key={t} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{TROOP_META[t].icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: TEXT }}>{TROOP_META[t].label}</span>
                <span style={{ fontSize: 10, color: MUTED }}>{avail}</span>
                <button onClick={() => setSendQty(q => ({ ...q, [t]: Math.max(0, q[t] - 1) }))} style={{ width: 24, height: 24, background: '#1a2a10', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#90d050', cursor: 'pointer', fontSize: 14 }}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, width: 24, textAlign: 'center' }}>{sendQty[t]}</span>
                <button onClick={() => setSendQty(q => ({ ...q, [t]: Math.min(avail, q[t] + 1) }))} style={{ width: 24, height: 24, background: '#1a2a10', border: `1px solid ${BORDER}`, borderRadius: 4, color: '#90d050', cursor: 'pointer', fontSize: 14 }}>+</button>
              </div>
            );
          })}
        </div>
        {attackMsg && <p style={{ fontSize: 12, color: attackMsg.startsWith('⚔️') ? '#80d060' : '#d06060' }}>{attackMsg}</p>}
        <button onClick={handleAttack} disabled={busy || totalSendQty === 0 || !attackTarget}
          style={{ fontWeight: 700, borderRadius: 10, padding: '11px 0', fontSize: 13, cursor: (busy || totalSendQty === 0 || !attackTarget) ? 'not-allowed' : 'pointer', background: (busy || totalSendQty === 0 || !attackTarget) ? '#120a0a' : '#3d1010', border: `1px solid ${(busy || totalSendQty === 0 || !attackTarget) ? '#2a1010' : '#8b1a1a'}`, color: (busy || totalSendQty === 0 || !attackTarget) ? '#3a1818' : '#ff8080' }}>
          {busy ? 'Sending…' : `⚔️ Send ${totalSendQty > 0 ? totalSendQty + ' ' : ''}Troops`}
        </button>
        {state!.pendingAttacks.length > 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Outgoing</p>
            {state!.pendingAttacks.map((a: AttackRecord) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TEXT, marginBottom: 3 }}>
                <span>→ Forge #{a.defenderForgeId}</span>
                <span style={{ fontFamily: 'monospace', color: '#e05050' }}>{fmtCountdown(a.arrivesAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'sans-serif', paddingBottom: 96 }}>

      {/* Dark sub-header — matches exchange/reports/store style */}
      <div style={{ background: 'rgba(0,0,0,0.85)', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>⚒</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>Forge #{state.forgeId}</span>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ background: '#1e2d10', border: `1px solid ${BORDER}`, borderRadius: 9999, padding: '3px 10px', fontSize: 12, color: GOLD }}>
            {fmt(state.ingotBalance)} Ingots
          </div>
        </div>
      </div>

      {/* Compact stat strip — troops total + owner shorthand */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 16px 0', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚔️</span>
          <div>
            <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Troops</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{totalStationed}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🪪</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.1, fontFamily: 'monospace' }}>{state.owner.slice(0, 4)}…{state.owner.slice(-4)}</div>
          </div>
        </div>
      </div>

      {/* Status message banner */}
      {msg && (
        <div style={{ maxWidth: 480, margin: '10px auto 0', padding: '0 16px' }}>
          <div style={{
            background: msg.startsWith('❌') ? '#1a0e0e' : '#0e1e0e',
            border: `1px solid ${msg.startsWith('❌') ? '#5a2a2a' : '#2a5a2a'}`,
            borderRadius: 10, padding: '8px 14px', fontSize: 12,
            color: msg.startsWith('❌') ? '#e06060' : '#70c070',
          }}>
            {msg}
          </div>
        </div>
      )}

      {/* ── In-page tab strip — only 3 tabs, centered, gold underline ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{
          display: 'flex',
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          marginTop: 14,
          overflow: 'hidden',
        }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '11px 0', background: active ? '#1a2a10' : 'transparent', border: 'none',
                  borderRight: t.id !== 'attack' ? `1px solid ${BORDER}` : 'none',
                  cursor: 'pointer',
                  color: active ? GOLD : DIM,
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '14px 16px 32px' }}>
        {tab === 'buildings' && <BuildingsTab />}
        {tab === 'troops'    && <TroopsTab />}
        {tab === 'attack'    && <AttackTab />}
      </div>

      <GameNav forgeId={state.forgeId} />
    </div>
  );
}

// ── Public scout view ─────────────────────────────────────────────────────────

const LEAGUE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: 'Bronze', color: '#d49060', bg: 'rgba(180,90,30,0.18)' },
  silver: { label: 'Silver', color: '#c8d0d8', bg: 'rgba(190,200,210,0.15)' },
  gold:   { label: 'Gold',   color: '#f5d060', bg: 'rgba(220,160,40,0.18)' },
};

function PublicForgeProfile({ state }: { state: ForgePublicResponse }) {
  const league = LEAGUE_BADGE[state.league] ?? LEAGUE_BADGE.bronze;
  const lastBattleAgo = state.lastBattleAt
    ? fmtAgo(state.lastBattleAt)
    : 'No battles yet';

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'sans-serif', paddingBottom: 96 }}>

      {/* Hero — same gradient as owner view, but with a "scout" framing */}
      <div style={{
        background: 'linear-gradient(to bottom,#fff 0%,#f0e0b0 22%,#c89828 48%,#5a3010 66%,#1a2810 82%,#0d1409 100%)',
        padding: '18px 20px 26px', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px',
          background: 'radial-gradient(circle at 35% 35%,#5a3a10,#1e1008)',
          border: '2px solid #c8a030',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, boxShadow: '0 0 18px rgba(200,160,48,0.4)',
        }}>⚒</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#f5d060' }}>Forge #{state.forgeId}</div>
        <div style={{ fontSize: 10, color: 'rgba(210,170,60,0.5)', marginTop: 2 }}>
          {state.owner.slice(0, 6)}…{state.owner.slice(-4)}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, padding: '4px 10px', borderRadius: 999, background: league.bg, border: `1px solid ${league.color}55`, fontSize: 11, fontWeight: 800, color: league.color }}>
          🏆 {league.label} · {state.warScore} WS
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>

        {/* Inscription */}
        {state.inscription && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#a0b870', fontStyle: 'italic', lineHeight: 1.55, marginBottom: 12 }}>
            “{state.inscription}”
          </div>
        )}

        {/* Stats grid — public-safe surface signals only */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <StatBox label="Position" value={state.position ? `${state.position.row},${state.position.col}` : '—'} />
          <StatBox label="Recent battles" value={state.recentBattlesCount > 0 ? `${state.recentBattlesCount} · 7d` : 'None · 7d'} />
          <StatBox label="Last battle" value={lastBattleAgo} />
          <StatBox label="Status" value={
            state.recentBattlesCount === 0 ? 'Quiet' :
            state.recentBattlesCount < 3   ? 'Active' :
                                             'Hot zone'
          } accent />
        </div>

        {/* What's hidden — set expectations honestly */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', fontSize: 11, color: MUTED, marginBottom: 14 }}>
          <p style={{ marginBottom: 4, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>🔒 Scouted view</p>
          <p style={{ lineHeight: 1.6 }}>
            Buildings, troop counts, and ingot reserves are private to the forge owner.
            Send a raid from your own forge to test their defences.
          </p>
        </div>

        {/* Raid hint — manual flow for now: copy ID, attack from own forge */}
        <div style={{ background: '#1a0e0e', border: '1px solid #4a1a1a', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>⚔️</div>
          <div style={{ flex: 1, fontSize: 12, color: '#e0a0a0', lineHeight: 1.5 }}>
            <strong style={{ color: '#ff8080' }}>Want to raid?</strong>{' '}
            Open your forge, go to Attack tab, and enter <strong>#{state.forgeId}</strong>.
          </div>
        </div>

        {/* Back to map */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/foundry" style={{ color: GOLD, fontSize: 12, fontWeight: 700, textDecoration: 'none', borderBottom: `1px dashed ${GOLD}55`, paddingBottom: 1 }}>
            ← Back to world map
          </Link>
        </div>
      </div>

      <GameNav />
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ? '#90d060' : TEXT, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ── Queue panel — shared by Construction (Buildings tab) and Training (Troops tab)

function QueuePanel({ title, iconHex, children }: { title: string; iconHex: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #1c1608, #0e0c04)',
      border: `1px solid ${iconHex}55`,
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 14,
      boxShadow: `0 0 18px ${iconHex}15`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: iconHex,
          boxShadow: `0 0 8px ${iconHex}aa`,
          animation: 'queue-pulse 1.6s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: iconHex,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          {title} · in progress
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
      <style>{`@keyframes queue-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

function QueueRow({
  icon, label, completesAt, startMs, onCancel, busy,
}: {
  icon: string;
  label: string;
  completesAt: string;
  startMs: number;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const endMs = new Date(completesAt).getTime();
  const now = Date.now();
  const total = Math.max(1, endMs - startMs);
  const elapsed = Math.min(total, Math.max(0, now - startMs));
  const pct = (elapsed / total) * 100;
  const queued = startMs > now;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: queued ? '#7a8a5a' : '#e8c060' }}>
            {queued ? 'Queued' : fmtCountdown(completesAt)}
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.45)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: queued ? '#3a4a18' : 'linear-gradient(90deg, #b45309, #f5d060)',
            transition: 'width 1s linear',
          }} />
        </div>
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: '1px solid #5a2a2a',
            color: '#e08080',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
          title="Cancel and refund full ingot cost"
        >
          ✕ Cancel
        </button>
      )}
    </div>
  );
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
