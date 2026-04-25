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

type Tab = 'buildings' | 'troops' | 'attack';

const SIDEBAR_ITEMS: { id: Tab | string; icon: string; label: string; href?: string }[] = [
  { id: 'buildings', icon: '🏗️', label: 'Buildings' },
  { id: 'troops',    icon: '⚔️', label: 'Troops' },
  { id: 'attack',    icon: '🗡️', label: 'Attack' },
  { id: 'sep', icon: '', label: '' },
  { id: 'map',      icon: '🗺️', label: 'Map',      href: '/foundry' },
  { id: 'exchange', icon: '⚗️', label: 'Exchange', href: '/foundry/exchange' },
  { id: 'reports',  icon: '📜', label: 'Reports',  href: '/foundry/reports' },
  { id: 'store',    icon: '🛒', label: 'Store',    href: '/foundry/store' },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ active, onTab }: { active: Tab; onTab: (t: Tab) => void }) {
  return (
    <aside style={{
      width: 72, flexShrink: 0,
      background: '#080c05',
      borderRight: '1px solid #1e2d10',
      display: 'flex', flexDirection: 'column',
      paddingTop: 12, paddingBottom: 12,
    }}>
      {SIDEBAR_ITEMS.map(item => {
        if (item.id === 'sep') return (
          <div key="sep" style={{ height: 1, background: '#1e2d10', margin: '8px 10px' }} />
        );

        const isActive = item.id === active;
        const inner = (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '8px 4px', margin: '1px 6px', borderRadius: 8,
            background: isActive ? 'rgba(180,130,30,0.15)' : 'transparent',
            borderLeft: isActive ? '2px solid #d4a438' : '2px solid transparent',
            cursor: 'pointer', transition: 'background 0.15s',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center',
              color: isActive ? '#f5d060' : '#3a5a20',
              textTransform: 'uppercase',
            }}>
              {item.label}
            </span>
          </div>
        );

        if (item.href) return (
          <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
            {inner}
          </Link>
        );

        return (
          <div key={item.id} onClick={() => onTab(item.id as Tab)}>
            {inner}
          </div>
        );
      })}
    </aside>
  );
}

// ── Mobile tab bar ────────────────────────────────────────────────────────────

function MobileTabs({ active, onTab }: { active: Tab; onTab: (t: Tab) => void }) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto',
      background: '#080c05',
      borderBottom: '1px solid #1e2d10',
      scrollbarWidth: 'none',
    }}>
      {SIDEBAR_ITEMS.map(item => {
        if (item.id === 'sep') return (
          <div key="sep" style={{ width: 1, background: '#1e2d10', flexShrink: 0, margin: '6px 0' }} />
        );

        const isActive = item.id === active;
        const inner = (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '8px 12px', flexShrink: 0, cursor: 'pointer',
            borderBottom: isActive ? '2px solid #d4a438' : '2px solid transparent',
            transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap',
              color: isActive ? '#f5d060' : '#3a5a20',
              textTransform: 'uppercase',
            }}>
              {item.label}
            </span>
          </div>
        );

        if (item.href) return (
          <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
            {inner}
          </Link>
        );

        return (
          <div key={item.id} onClick={() => onTab(item.id as Tab)}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ForgePage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [state, setState]   = useState<ForgeStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState('');
  const [tab, setTab]       = useState<Tab>('buildings');
  const [trainQty, setTrainQty] = useState<Record<TroopType, number>>({
    smelters: 1, ash_archers: 1, iron_guards: 1,
  });
  const [attackTarget, setAttackTarget] = useState('');
  const [sendQty, setSendQty] = useState<Record<TroopType, number>>({
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
        ? `✅ ${BUILDING_META[buildingType].label} → Lv${d.toLevel}`
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
      setAttackMsg(`⚔️ Launched! Arrives in ~${data.travelMins} min`);
      setSendQty({ smelters: 0, ash_archers: 0, iron_guards: 0 });
      fetchState();
    } finally { setBusy(false); }
  }

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0e06', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#d4a438', fontSize: 14, fontWeight: 700 }}>Loading forge…</span>
    </div>
  );
  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0a0e06', padding: '48px 16px' }}>
      <p style={{ color: '#e05050', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠ {error}</p>
      <Link href="/foundry" style={{ color: '#d4a438', fontSize: 13 }}>← Back to map</Link>
    </div>
  );
  if (!state) return null;

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalStationed = state.troops.smelters + state.troops.ash_archers + state.troops.iron_guards;

  // ── Panels ──────────────────────────────────────────────────────────────────

  function BuildingsPanel() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {state.construction && (
          <div style={{ background: '#1e1a08', border: '1px solid #6a4a10', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#e8c060', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span>🔨</span>
            <span>
              <strong>{BUILDING_META[state.construction.buildingType as BuildingType].label}</strong>
              {' → '}Lv{state.construction.toLevel}
              {' · '}<span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtCountdown(state.construction.completesAt)}</span>
            </span>
          </div>
        )}

        {ALL_BUILDINGS.map(type => {
          const meta       = BUILDING_META[type];
          const level      = state!.buildings[type] ?? 0;
          const toLevel    = level + 1;
          const cost       = level < 5 ? buildCost(type, toLevel) : 0;
          const isBuilding = state!.construction?.buildingType === type;
          const canUpgrade = isOwner && level < 5 && !state!.construction && state!.ingotBalance >= cost && !busy;
          const pct        = (level / 5) * 100;

          return (
            <div key={type} style={{
              background: isBuilding ? '#181410' : '#0e1509',
              border: `1px solid ${isBuilding ? '#6a4a10' : '#1e2d10'}`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22, flexShrink: 0, width: 28, textAlign: 'center' }}>{meta.icon}</span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#d4c090' }}>{meta.label}</span>
                  <span style={{ fontSize: 10, color: '#4a6a2a' }}>Lv {level}/5</span>
                </div>
                <div style={{ height: 3, background: '#1e2d10', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #b45309, #f59e0b)', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              </div>

              <div style={{ flexShrink: 0, minWidth: 68, textAlign: 'right' }}>
                {level >= 5 ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#d4a438' }}>MAX</span>
                ) : isBuilding ? (
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#e8a020' }}>
                    {fmtCountdown(state!.construction!.completesAt)}
                  </span>
                ) : isOwner ? (
                  <button onClick={() => handleBuild(type)} disabled={!canUpgrade}
                    style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: canUpgrade ? 'pointer' : 'not-allowed',
                      background: canUpgrade ? '#243d10' : '#101808',
                      border: `1px solid ${canUpgrade ? '#4a7a20' : '#1e2a10'}`,
                      color: canUpgrade ? '#a0d050' : '#2a3d1a',
                      whiteSpace: 'nowrap',
                    }}>
                    {level === 0 ? 'Build' : 'Upgrade'}
                    <span style={{ display: 'block', fontSize: 9, color: canUpgrade ? '#6a9a30' : '#243018' }}>
                      {fmt(cost)} ⚙
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function TroopsPanel() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: '#4a6a2a', marginBottom: 2 }}>
          {totalStationed} / {state!.troopCapacity} stationed
          {state!.buildings['barracks'] < 1 && isOwner && (
            <span style={{ color: '#c07020', marginLeft: 8 }}>— build Barracks first</span>
          )}
        </div>

        {ALL_TROOPS.map(type => {
          const meta     = TROOP_META[type];
          const qty      = trainQty[type];
          const cost     = meta.cost * qty;
          const canTrain = isOwner && state!.buildings['barracks'] >= 1 && state!.ingotBalance >= cost && !busy;
          const stationed = state!.troops[type as keyof TroopCount];

          return (
            <div key={type} style={{ background: '#0e1509', border: '1px solid #1e2d10', borderRadius: 10, padding: 12 }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#d4c090' }}>{meta.label}</div>
                  <div style={{ fontSize: 10, color: '#4a6a2a' }}>
                    <strong style={{ color: '#a0c060' }}>{stationed}</strong> stationed
                  </div>
                </div>
                {/* ATK/DEF badges */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <div style={{ background: '#1e0d0d', border: '1px solid #3d1515', borderRadius: 6, padding: '3px 7px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e05050', lineHeight: 1 }}>{meta.atk}</div>
                    <div style={{ fontSize: 7, color: '#5a3030' }}>ATK</div>
                  </div>
                  <div style={{ background: '#0d1520', border: '1px solid #152540', borderRadius: 6, padding: '3px 7px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#5090d0', lineHeight: 1 }}>{meta.def}</div>
                    <div style={{ fontSize: 7, color: '#2a4060' }}>DEF</div>
                  </div>
                </div>
              </div>

              {/* Train row */}
              {isOwner && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: '#4a6a2a', marginRight: 2 }}>Train:</div>
                  <button onClick={() => setTrainQty(q => ({ ...q, [type]: Math.max(1, q[type] - 1) }))}
                    style={{ width: 24, height: 24, background: '#1a2a10', border: '1px solid #2a3d1a', borderRadius: 5, color: '#a0c060', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#d4c090', width: 24, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => setTrainQty(q => ({ ...q, [type]: Math.min(20, q[type] + 1) }))}
                    style={{ width: 24, height: 24, background: '#1a2a10', border: '1px solid #2a3d1a', borderRadius: 5, color: '#a0c060', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  <button onClick={() => handleTrain(type)} disabled={!canTrain}
                    style={{
                      flex: 1, fontSize: 11, fontWeight: 700, borderRadius: 7, padding: '5px 0', cursor: canTrain ? 'pointer' : 'not-allowed',
                      background: canTrain ? '#1a3010' : '#0d1408',
                      border: `1px solid ${canTrain ? '#3a6020' : '#1a2410'}`,
                      color: canTrain ? '#90d050' : '#2a3d1a',
                    }}>
                    {fmt(cost)} ⚙
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Training queue */}
        {state!.trainingQueue.length > 0 && (
          <div style={{ background: '#0e1509', border: '1px solid #1e2d10', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3a5020', marginBottom: 8 }}>
              Training Queue
            </div>
            {state!.trainingQueue.map((item: TrainingItem, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a0b880', marginBottom: 4 }}>
                <span>{TROOP_META[item.type as TroopType].icon} {item.quantity}× {TROOP_META[item.type as TroopType].label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d4a438' }}>{fmtCountdown(item.completesAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function AttackPanel() {
    if (state!.buildings.rally_point < 1) return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: '#3a5020', fontSize: 13 }}>
        🗺️ Build a <strong style={{ color: '#6a8a40' }}>Rally Point</strong> to unlock attacks.
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: '#4a6a2a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target Forge</div>
          <input type="number" min={1} max={500} value={attackTarget}
            onChange={e => setAttackTarget(e.target.value)}
            placeholder="Forge ID (1–500)"
            style={{ width: '100%', background: '#0a0e06', border: '1px solid #2a3d1a', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: '#e8d5a3', outline: 'none' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 10, color: '#4a6a2a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Select Troops</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_TROOPS.map(t => {
              const meta  = TROOP_META[t];
              const avail = state!.troops[t];
              return (
                <div key={t} style={{ background: '#0e1509', border: '1px solid #1e2d10', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, flex: 1, color: '#a0b880' }}>{meta.label}</span>
                  <span style={{ fontSize: 10, color: '#3a5020' }}>{avail} avail</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button onClick={() => setSendQty(q => ({ ...q, [t]: Math.max(0, q[t] - 1) }))}
                      style={{ width: 22, height: 22, background: '#1a2a10', border: '1px solid #2a3d1a', borderRadius: 4, color: '#a0c060', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#d4c090', width: 24, textAlign: 'center' }}>{sendQty[t]}</span>
                    <button onClick={() => setSendQty(q => ({ ...q, [t]: Math.min(avail, q[t] + 1) }))}
                      style={{ width: 22, height: 22, background: '#1a2a10', border: '1px solid #2a3d1a', borderRadius: 4, color: '#a0c060', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {attackMsg && (
          <p style={{ fontSize: 12, color: attackMsg.startsWith('⚔️') ? '#80d060' : '#d06060', margin: 0 }}>{attackMsg}</p>
        )}

        <button onClick={handleAttack} disabled={busy || totalSendQty === 0 || !attackTarget}
          style={{
            fontWeight: 700, borderRadius: 10, padding: '12px 0', fontSize: 13, cursor: (busy || totalSendQty === 0 || !attackTarget) ? 'not-allowed' : 'pointer',
            background: (busy || totalSendQty === 0 || !attackTarget) ? '#120808' : '#3d1010',
            border: `1px solid ${(busy || totalSendQty === 0 || !attackTarget) ? '#2a1010' : '#8b1a1a'}`,
            color: (busy || totalSendQty === 0 || !attackTarget) ? '#3a1818' : '#ff8080',
          }}>
          {busy ? 'Sending…' : totalSendQty > 0 ? `⚔️ Send ${totalSendQty} Troops` : '⚔️ Send Attack'}
        </button>

        {state!.pendingAttacks.length > 0 && (
          <div style={{ background: '#0e1509', border: '1px solid #1e2d10', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3a5020', marginBottom: 8 }}>Outgoing</div>
            {state!.pendingAttacks.map((a: AttackRecord) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#806060', marginBottom: 4 }}>
                <span>→ Forge #{a.defenderForgeId}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e05050' }}>{fmtCountdown(a.arrivesAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e06', color: '#e8d5a3', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── Hero header: white → dark gradient ── */}
      <div style={{
        background: 'linear-gradient(to bottom, #ffffff 0%, #f0e8d0 20%, #c8a030 45%, #5a3010 65%, #1a2810 82%, #0a0e06 100%)',
        padding: '20px 20px 28px',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', margin: '0 auto 10px',
          background: 'radial-gradient(circle at 35% 35%, #5a3a10, #1e1008)',
          border: '2px solid #c8a030',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
          boxShadow: '0 0 20px rgba(200,160,48,0.4)',
        }}>⚒</div>

        <div style={{ fontSize: 19, fontWeight: 800, color: '#f5d060', letterSpacing: '-0.02em' }}>
          Forge #{state.forgeId}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(210,170,60,0.55)', marginTop: 3 }}>
          {state.owner.slice(0, 6)}…{state.owner.slice(-4)}
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { val: fmt(state.ingotBalance), label: '💰 Ingots' },
            { val: String(totalStationed),  label: '⚔️ Troops' },
          ].map(({ val, label }) => (
            <div key={label} style={{
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(200,160,48,0.25)',
              borderRadius: 8, padding: '5px 12px', textAlign: 'center',
              backdropFilter: 'blur(4px)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f5d060', lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 9, color: 'rgba(200,170,80,0.5)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {msg && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#b0d080', background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '6px 14px', display: 'inline-block' }}>
            {msg}
          </div>
        )}
      </div>

      {/* ── Mobile tabs (visible on small screens) ── */}
      <div className="sm:hidden">
        <MobileTabs active={tab} onTab={setTab} />
      </div>

      {/* ── Body: sidebar + content (desktop) ── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* Sidebar (hidden on mobile) */}
        <div className="hidden sm:block">
          <Sidebar active={tab} onTab={setTab} />
        </div>

        {/* Content panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {tab === 'buildings' && <BuildingsPanel />}
          {tab === 'troops'    && <TroopsPanel />}
          {tab === 'attack'    && <AttackPanel />}
        </div>
      </div>
    </div>
  );
}
