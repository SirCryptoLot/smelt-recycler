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
    <div className="flex items-center justify-center h-screen text-amber-500 text-sm font-bold"
      style={{ background: '#0d1408' }}>
      Loading forge…
    </div>
  );
  if (error) return (
    <div className="max-w-lg mx-auto pt-12 px-4" style={{ background: '#0d1408', minHeight: '100vh' }}>
      <p className="text-red-400 text-sm font-bold mb-2">⚠ {error}</p>
      <Link href="/foundry" className="text-amber-500 underline text-sm">← Back to map</Link>
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
    <div className="min-h-screen pb-20 font-sans" style={{ background: '#0d1408', color: '#e8d5a3' }}>

      {/* ── Top nav ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5"
        style={{ background: 'rgba(0,0,0,0.85)', borderBottom: '1px solid #2a3d1a' }}>
        <Link href="/foundry"
          className="text-xs font-semibold"
          style={{ color: '#6b9e4a' }}>
          ← Map
        </Link>
        <span style={{ color: '#2a3d1a' }}>|</span>
        <span className="text-xs font-bold" style={{ color: '#d4a438' }}>⚒ Forge #{state.forgeId}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: '#1e2d10', border: '1px solid #4a6a2a', color: '#f0c060' }}>
            💰 {fmt(state.ingotBalance)} Ingots
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* ── Forge header ── */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #3a5a20', background: '#111a08' }}>
          {/* Banner */}
          <div className="px-5 py-4 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg, #1e3010 0%, #2d4a18 50%, #1a2a0e 100%)' }}>
            <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #4a7a28' }}>
              ⚒
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base leading-tight" style={{ color: '#f5d060' }}>
                Forge #{state.forgeId}
              </div>
              <div className="text-xs truncate mt-0.5" style={{ color: '#5a7a3a' }}>
                {state.owner}
              </div>
            </div>
            <Link href="/foundry/reports"
              className="text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: '#a0c060', border: '1px solid #3a5a20', background: 'rgba(0,0,0,0.3)' }}>
              Reports
            </Link>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-3 divide-x" style={{ divideColor: '#2a3d1a', borderTop: '1px solid #2a3d1a' }}>
            {[
              { val: builtCount,     label: 'Buildings' },
              { val: totalStationed, label: 'Troops' },
              { val: `Lv ${avgLevel}`, label: 'Avg Level' },
            ].map(({ val, label }) => (
              <div key={label} className="py-3 text-center">
                <div className="text-lg font-bold" style={{ color: '#f5d060' }}>{val}</div>
                <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: '#4a6a2a' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Status banners ── */}
        {msg && (
          <div className="rounded-xl px-4 py-2.5 text-sm"
            style={{ background: '#1a2a10', border: '1px solid #4a6a2a', color: '#b0d080' }}>
            {msg}
          </div>
        )}
        {state.construction && (
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm"
            style={{ background: '#1e1a08', border: '1px solid #6a4a10', color: '#e8c060' }}>
            <span>🔨</span>
            <span>
              Upgrading <strong>{BUILDING_META[state.construction.buildingType as BuildingType].label}</strong> to Lv{state.construction.toLevel}
              {' — '}<span className="font-mono font-bold">{fmtCountdown(state.construction.completesAt)}</span> remaining
            </span>
          </div>
        )}

        {/* ── Buildings ── */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#4a6a2a' }}>
            Buildings
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ALL_BUILDINGS.map(type => {
              const meta       = BUILDING_META[type];
              const level      = state.buildings[type] ?? 0;
              const toLevel    = level + 1;
              const cost       = level < 5 ? buildCost(type, toLevel) : 0;
              const isBuilding = state.construction?.buildingType === type;
              const canUpgrade = isOwner && level < 5 && !state.construction && state.ingotBalance >= cost && !busy;
              const pct        = (level / 5) * 100;

              return (
                <div key={type}
                  className="rounded-xl p-3 flex flex-col gap-2 transition-colors"
                  style={{
                    background: isBuilding ? '#1e1a08' : '#111a08',
                    border: `1px solid ${isBuilding ? '#6a4a10' : '#2a3d1a'}`,
                  }}>

                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold leading-tight truncate" style={{ color: '#d4c090' }}>
                        {meta.label}
                      </div>
                      <div className="text-[10px]" style={{ color: '#4a6a2a' }}>Lv {level} / 5</div>
                    </div>
                  </div>

                  {/* Level bar */}
                  <div className="h-1 rounded-full" style={{ background: '#1e2d10' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #b45309, #f59e0b)' }} />
                  </div>

                  <div className="text-[9px] leading-tight" style={{ color: '#3a5a20' }}>
                    {meta.effectLabel}
                  </div>

                  {level >= 5 ? (
                    <div className="text-[10px] font-bold text-center" style={{ color: '#d4a438' }}>MAX</div>
                  ) : isBuilding ? (
                    <div className="text-[10px] font-mono font-bold text-center rounded-lg py-1"
                      style={{ background: '#1a1508', color: '#e8a020' }}>
                      {fmtCountdown(state.construction!.completesAt)}
                    </div>
                  ) : isOwner ? (
                    <button
                      onClick={() => handleBuild(type)}
                      disabled={!canUpgrade}
                      className="text-[10px] font-bold rounded-lg py-1.5 w-full transition-colors"
                      style={canUpgrade
                        ? { background: '#2d4a10', border: '1px solid #4a7a20', color: '#b0d060', cursor: 'pointer' }
                        : { background: '#141d0a', border: '1px solid #2a3510', color: '#3a4a28', cursor: 'not-allowed' }}>
                      {level === 0 ? 'Build' : 'Upgrade'} — {fmt(cost)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Troops ── */}
        <section>
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#4a6a2a' }}>Troops</div>
            <span className="text-[10px]" style={{ color: '#3a5a20' }}>
              {totalStationed} / {state.troopCapacity} stationed
            </span>
            {state.buildings['barracks'] < 1 && isOwner && (
              <span className="text-[10px]" style={{ color: '#c07020' }}>— build Barracks first</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {ALL_TROOPS.map(type => {
              const meta     = TROOP_META[type];
              const qty      = trainQty[type];
              const cost     = meta.cost * qty;
              const canTrain = isOwner && state.buildings['barracks'] >= 1 && state.ingotBalance >= cost && !busy;

              return (
                <div key={type} className="rounded-xl p-3 flex flex-col gap-2.5"
                  style={{ background: '#111a08', border: '1px solid #2a3d1a' }}>

                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: '#d4c090' }}>{meta.label}</div>
                      <div className="text-[10px]" style={{ color: '#4a6a2a' }}>
                        Stationed: <strong style={{ color: '#a0c060' }}>{state.troops[type as keyof TroopCount]}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <div className="rounded-lg py-1 text-center" style={{ background: '#1e0d0d', border: '1px solid #3d1515' }}>
                      <div className="text-[11px] font-bold" style={{ color: '#e05050' }}>{meta.atk}</div>
                      <div className="text-[8px]" style={{ color: '#5a3030' }}>ATK</div>
                    </div>
                    <div className="rounded-lg py-1 text-center" style={{ background: '#0d1520', border: '1px solid #152540' }}>
                      <div className="text-[11px] font-bold" style={{ color: '#5090d0' }}>{meta.def}</div>
                      <div className="text-[8px]" style={{ color: '#2a4060' }}>DEF</div>
                    </div>
                    <div className="rounded-lg py-1 text-center" style={{ background: '#1a1408', border: '1px solid #3a2d10' }}>
                      <div className="text-[11px] font-bold" style={{ color: '#c09030' }}>{meta.cost}</div>
                      <div className="text-[8px]" style={{ color: '#4a3a18' }}>each</div>
                    </div>
                  </div>

                  {isOwner && (
                    <div className="flex gap-1.5">
                      <input
                        type="number" min={1} max={20} value={qty}
                        onChange={e => setTrainQty(q => ({
                          ...q, [type]: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                        }))}
                        className="w-12 rounded-lg px-1 py-1 text-[10px] text-center"
                        style={{ background: '#0d1408', border: '1px solid #2a3d1a', color: '#d4c090' }}
                      />
                      <button
                        onClick={() => handleTrain(type)}
                        disabled={!canTrain}
                        className="flex-1 text-[10px] font-bold rounded-lg py-1.5 transition-colors"
                        style={canTrain
                          ? { background: '#1a3010', border: '1px solid #3a6020', color: '#90d050', cursor: 'pointer' }
                          : { background: '#0d1408', border: '1px solid #1e2d10', color: '#2a3d1a', cursor: 'not-allowed' }}>
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
            <div className="mt-2.5 rounded-xl p-3" style={{ background: '#111a08', border: '1px solid #2a3d1a' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#4a6a2a' }}>
                Training Queue
              </div>
              <div className="space-y-1.5">
                {state.trainingQueue.map((item: TrainingItem, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs" style={{ color: '#a0b880' }}>
                    <span>{TROOP_META[item.type as TroopType].icon} {item.quantity}× {TROOP_META[item.type as TroopType].label}</span>
                    <span className="font-mono font-bold" style={{ color: '#d4a438' }}>{fmtCountdown(item.completesAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Attack Panel ── */}
        {state.buildings.rally_point >= 1 && (
          <section className="rounded-2xl p-4 space-y-3"
            style={{ background: '#150d0d', border: '1px solid #4a1a1a' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6a2a2a' }}>
              ⚔️ Send Attack
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs flex-shrink-0 w-28" style={{ color: '#806060' }}>Target Forge ID</label>
              <input
                type="number" min={1} max={500} value={attackTarget}
                onChange={e => setAttackTarget(e.target.value)}
                placeholder="e.g. 42"
                className="w-24 rounded-lg px-2 py-1 text-sm text-center"
                style={{ background: '#0d0808', border: '1px solid #3a1a1a', color: '#e8c0c0' }}
              />
            </div>

            <div className="space-y-2">
              {ALL_TROOPS.map(t => {
                const meta  = TROOP_META[t];
                const avail = state.troops[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-sm w-5">{meta.icon}</span>
                    <span className="text-xs flex-1" style={{ color: '#806060' }}>{meta.label}</span>
                    <span className="text-xs" style={{ color: '#5a3a3a' }}>{avail} avail</span>
                    <input
                      type="number" min={0} max={avail} value={sendQty[t]}
                      onChange={e => setSendQty(q => ({ ...q, [t]: Math.min(avail, Math.max(0, Number(e.target.value))) }))}
                      className="w-16 rounded-lg px-2 py-1 text-sm text-center"
                      style={{ background: '#0d0808', border: '1px solid #3a1a1a', color: '#e8c0c0' }}
                    />
                  </div>
                );
              })}
            </div>

            {attackMsg && (
              <p className="text-xs"
                style={{ color: attackMsg.startsWith('⚔️') ? '#80d060' : '#d06060' }}>
                {attackMsg}
              </p>
            )}

            <button
              onClick={handleAttack}
              disabled={busy || totalSendQty === 0 || !attackTarget}
              className="w-full font-bold rounded-xl py-2 text-sm transition-colors"
              style={busy || totalSendQty === 0 || !attackTarget
                ? { background: '#1a0d0d', border: '1px solid #3a1a1a', color: '#4a2a2a', cursor: 'not-allowed' }
                : { background: '#3d1010', border: '1px solid #8b1a1a', color: '#ff8080', cursor: 'pointer' }}>
              {busy ? 'Sending…' : `Send ${totalSendQty > 0 ? totalSendQty + ' ' : ''}Troops`}
            </button>

            {state.pendingAttacks.length > 0 && (
              <div className="pt-3 space-y-1" style={{ borderTop: '1px solid #2a1515' }}>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#4a2a2a' }}>Outgoing</p>
                {state.pendingAttacks.map((a: AttackRecord) => (
                  <div key={a.id} className="flex justify-between text-xs" style={{ color: '#806060' }}>
                    <span>→ Forge #{a.defenderForgeId}</span>
                    <span className="font-mono font-bold" style={{ color: '#e05050' }}>{fmtCountdown(a.arrivesAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Inscription ── */}
        <div className="rounded-xl px-4 py-3 text-xs italic leading-relaxed"
          style={{ background: '#0d1008', border: '1px solid #1e2d10', color: '#3a5020' }}>
          {state.inscription}
        </div>

      </div>
    </div>
  );
}
