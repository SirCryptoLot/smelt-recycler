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

  const isOwner     = !!wallet && state?.owner === wallet;
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
    <div className="flex items-center justify-center h-screen bg-stone-50 text-stone-400 text-sm">
      Loading forge…
    </div>
  );
  if (error) return (
    <div className="max-w-lg mx-auto pt-12 px-4 text-red-500 text-sm">
      <p className="font-bold mb-2">⚠ {error}</p>
      <Link href="/foundry" className="text-amber-600 underline">← Back to map</Link>
    </div>
  );
  if (!state) return null;

  // ── Derived values ──────────────────────────────────────────────────────────

  const totalStationed  = state.troops.smelters + state.troops.ash_archers + state.troops.iron_guards;
  const builtCount      = ALL_BUILDINGS.filter(b => (state.buildings[b] ?? 0) > 0).length;
  const avgLevel        = builtCount === 0 ? 0
    : Math.round(ALL_BUILDINGS.reduce((s, b) => s + (state.buildings[b] ?? 0), 0) / ALL_BUILDINGS.length * 10) / 10;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans pb-24">

      {/* ── Top nav bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-4 py-2 flex items-center gap-3">
        <Link href="/foundry" className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1">
          ← Map
        </Link>
        <span className="text-stone-300">|</span>
        <span className="text-xs font-bold text-stone-700">⚒ Forge #{state.forgeId}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5">
            💰 {fmt(state.ingotBalance)} Ingots
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* ── Forge header card ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm border border-stone-200">
          <div className="bg-gradient-to-r from-amber-700 to-amber-900 px-5 py-4 flex items-center gap-3">
            <span className="text-3xl">⚒</span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-base leading-tight">Forge #{state.forgeId}</div>
              <div className="text-amber-200 text-xs truncate">{state.owner}</div>
            </div>
            <Link href="/foundry/reports"
              className="text-amber-200 hover:text-white text-xs border border-amber-600 rounded-lg px-2 py-1 transition-colors">
              Reports
            </Link>
          </div>

          {/* Stat chips */}
          <div className="bg-white grid grid-cols-3 divide-x divide-stone-100">
            <div className="px-4 py-3 text-center">
              <div className="text-lg font-bold text-stone-800">{builtCount}</div>
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Buildings</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-lg font-bold text-stone-800">{totalStationed}</div>
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Troops</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-lg font-bold text-stone-800">Lv {avgLevel}</div>
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Avg Level</div>
            </div>
          </div>
        </div>

        {/* ── Status / construction banners ── */}
        {msg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            {msg}
          </div>
        )}
        {state.construction && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
            <span className="text-base">🔨</span>
            <span>
              Upgrading <strong>{BUILDING_META[state.construction.buildingType as BuildingType].label}</strong> to Lv{state.construction.toLevel}
              {' — '}<span className="font-mono font-bold">{fmtCountdown(state.construction.completesAt)}</span> remaining
            </span>
          </div>
        )}

        {/* ── Buildings ── */}
        <section>
          <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Buildings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ALL_BUILDINGS.map(type => {
              const meta      = BUILDING_META[type];
              const level     = state.buildings[type] ?? 0;
              const toLevel   = level + 1;
              const cost      = level < 5 ? buildCost(type, toLevel) : 0;
              const isBuilding = state.construction?.buildingType === type;
              const canUpgrade = isOwner && level < 5 && !state.construction && state.ingotBalance >= cost && !busy;
              const pct        = (level / 5) * 100;

              return (
                <div key={type}
                  className={`rounded-xl border bg-white p-3 flex flex-col gap-2 shadow-sm transition-colors
                    ${isBuilding ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`}>

                  {/* Icon + name */}
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">{meta.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-stone-700 leading-tight truncate">{meta.label}</div>
                      <div className="text-[10px] text-stone-400">Lv {level} / 5</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Effect */}
                  <div className="text-[9px] text-stone-400 leading-tight">{meta.effectLabel}</div>

                  {/* Button */}
                  {level >= 5 ? (
                    <div className="text-[10px] font-bold text-amber-600 text-center">MAX</div>
                  ) : isBuilding ? (
                    <div className="text-[10px] font-mono font-bold text-amber-700 text-center bg-amber-100 rounded-lg py-1">
                      {fmtCountdown(state.construction!.completesAt)}
                    </div>
                  ) : isOwner ? (
                    <button
                      onClick={() => handleBuild(type)}
                      disabled={!canUpgrade}
                      className={`text-[10px] font-bold rounded-lg py-1.5 w-full transition-colors
                        ${canUpgrade
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-stone-100 text-stone-400 cursor-not-allowed'}`}
                    >
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
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Troops</h2>
            <span className="text-[10px] text-stone-400">{totalStationed} / {state.troopCapacity} stationed</span>
            {state.buildings['barracks'] < 1 && isOwner && (
              <span className="text-[10px] text-orange-500">— build Barracks first</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {ALL_TROOPS.map(type => {
              const meta     = TROOP_META[type];
              const qty      = trainQty[type];
              const cost     = meta.cost * qty;
              const canTrain = isOwner && state.buildings['barracks'] >= 1 && state.ingotBalance >= cost && !busy;

              return (
                <div key={type} className="rounded-xl border border-stone-200 bg-white p-3 flex flex-col gap-2.5 shadow-sm">

                  {/* Icon + stationed */}
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">{meta.icon}</span>
                    <div>
                      <div className="text-[11px] font-bold text-stone-700">{meta.label}</div>
                      <div className="text-[10px] text-stone-400">Stationed: <strong className="text-stone-600">{state.troops[type as keyof TroopCount]}</strong></div>
                    </div>
                  </div>

                  {/* ATK / DEF / Cost chips */}
                  <div className="grid grid-cols-3 gap-1">
                    <div className="bg-red-50 border border-red-100 rounded-lg py-1 text-center">
                      <div className="text-[11px] font-bold text-red-600">{meta.atk}</div>
                      <div className="text-[8px] text-stone-400">ATK</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg py-1 text-center">
                      <div className="text-[11px] font-bold text-blue-600">{meta.def}</div>
                      <div className="text-[8px] text-stone-400">DEF</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg py-1 text-center">
                      <div className="text-[11px] font-bold text-amber-700">{meta.cost}</div>
                      <div className="text-[8px] text-stone-400">each</div>
                    </div>
                  </div>

                  {/* Train controls */}
                  {isOwner && (
                    <div className="flex gap-1.5">
                      <input
                        type="number" min={1} max={20} value={qty}
                        onChange={e => setTrainQty(q => ({
                          ...q, [type]: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                        }))}
                        className="w-12 border border-stone-200 rounded-lg px-1 py-1 text-[10px] text-center bg-stone-50 text-stone-700"
                      />
                      <button
                        onClick={() => handleTrain(type)}
                        disabled={!canTrain}
                        className={`flex-1 text-[10px] font-bold rounded-lg py-1.5 transition-colors
                          ${canTrain
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-stone-100 text-stone-400 cursor-not-allowed'}`}
                      >
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
            <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Training Queue</div>
              <div className="space-y-1.5">
                {state.trainingQueue.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-stone-600">
                    <span>{TROOP_META[item.type as TroopType].icon} {item.quantity}× {TROOP_META[item.type as TroopType].label}</span>
                    <span className="font-mono font-bold text-amber-700">{fmtCountdown(item.completesAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Attack Panel ── */}
        {state.buildings.rally_point >= 1 && (
          <section className="rounded-2xl border border-red-100 bg-white shadow-sm p-4 space-y-3">
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest">⚔️ Send Attack</h2>

            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500 w-28 flex-shrink-0">Target Forge ID</label>
              <input
                type="number" min={1} max={500} value={attackTarget}
                onChange={e => setAttackTarget(e.target.value)}
                placeholder="e.g. 42"
                className="w-24 border border-stone-200 rounded-lg px-2 py-1 text-sm text-center bg-stone-50"
              />
            </div>

            <div className="space-y-2">
              {ALL_TROOPS.map(t => {
                const meta  = TROOP_META[t];
                const avail = state.troops[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-sm w-5">{meta.icon}</span>
                    <span className="text-xs text-stone-600 flex-1">{meta.label}</span>
                    <span className="text-xs text-stone-400">{avail} avail</span>
                    <input
                      type="number" min={0} max={avail} value={sendQty[t]}
                      onChange={e => setSendQty(q => ({ ...q, [t]: Math.min(avail, Math.max(0, Number(e.target.value))) }))}
                      className="w-16 border border-stone-200 rounded-lg px-2 py-1 text-sm text-center bg-stone-50"
                    />
                  </div>
                );
              })}
            </div>

            {attackMsg && (
              <p className={`text-xs ${attackMsg.startsWith('⚔️') ? 'text-green-700' : 'text-red-600'}`}>
                {attackMsg}
              </p>
            )}

            <button
              onClick={handleAttack}
              disabled={busy || totalSendQty === 0 || !attackTarget}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-xl py-2 text-sm transition-colors"
            >
              {busy ? 'Sending…' : `Send ${totalSendQty > 0 ? totalSendQty : ''} Troops`}
            </button>

            {state.pendingAttacks.length > 0 && (
              <div className="border-t border-stone-100 pt-3 space-y-1">
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wide">Outgoing</p>
                {state.pendingAttacks.map((a: AttackRecord) => (
                  <div key={a.id} className="flex justify-between text-xs text-stone-600">
                    <span>→ Forge #{a.defenderForgeId}</span>
                    <span className="text-red-600 font-mono font-bold">{fmtCountdown(a.arrivesAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Inscription ── */}
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs text-stone-400 italic leading-relaxed shadow-sm">
          {state.inscription}
        </div>

      </div>
    </div>
  );
}
