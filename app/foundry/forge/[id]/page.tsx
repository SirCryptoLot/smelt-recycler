// app/foundry/forge/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ForgeStateResponse } from '@/app/api/foundry/forge/[id]/route';
import type { ConstructionSlot } from '@/lib/foundry-buildings';
import {
  BUILDING_META, ALL_BUILDINGS, buildCost, BuildingType,
  TROOP_META, ALL_TROOPS, TroopType,
  TroopCount, TrainingItem, AttackRecord,
} from '@/lib/foundry-constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSmelt(n: number) { return n.toLocaleString('en-US'); }

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
  const [attackTarget, setAttackTarget]   = useState('');
  const [sendQty, setSendQty]             = useState<Record<TroopType, number>>({
    smelters: 0, ash_archers: 0, iron_guards: 0,
  });
  const [attackMsg, setAttackMsg]         = useState('');
  const [, setTick] = useState(0);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/foundry/forge/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to load forge');
      } else {
        setState(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Countdown re-render every second
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const isOwner = !!wallet && state?.owner === wallet;
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
    } finally {
      setBusy(false);
    }
  }

  async function handleAttack() {
    if (!wallet) { setAttackMsg('Connect wallet first'); return; }
    const forgeId = parseInt(id, 10);
    const targetId = parseInt(attackTarget, 10);
    if (isNaN(targetId) || targetId < 1 || targetId > 500) {
      setAttackMsg('Enter a valid target forge ID (1–500)');
      return;
    }
    if (totalSendQty === 0) {
      setAttackMsg('Select at least 1 troop to send');
      return;
    }
    setBusy(true);
    setAttackMsg('');
    try {
      const res = await fetch('/api/foundry/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attackerForgeId: forgeId,
          defenderForgeId: targetId,
          troops: sendQty,
          wallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAttackMsg(data.error ?? 'Failed'); return; }
      setAttackMsg(`⚔️ Attack launched! Arrives in ~${data.travelMins} min`);
      setSendQty({ smelters: 0, ash_archers: 0, iron_guards: 0 });
      fetchState();
    } finally {
      setBusy(false);
    }
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
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0d1117] text-amber-400">Loading forge…</div>
  );
  if (error) return (
    <div className="max-w-lg mx-auto pt-12 px-4 text-red-400">
      <p className="font-bold mb-2">⚠ {error}</p>
      <Link href="/foundry" className="text-amber-400 underline text-sm">← Back to map</Link>
    </div>
  );
  if (!state) return null;

  const totalStationed = state.troops.smelters + state.troops.ash_archers + state.troops.iron_guards;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e8d5a3] font-serif">

      {/* ── Header ── */}
      <div className="border-b-2 border-[#5a3e1b] bg-gradient-to-b from-[#1a110a] to-[#110c06] px-5 py-3 flex items-center gap-3 flex-wrap">
        <Link href="/foundry" className="text-amber-600 text-xs hover:text-amber-400">← World Map</Link>
        <Link href="/foundry/reports" className="text-xs text-red-600 hover:underline ml-3">
          ⚔️ Battle Reports
        </Link>
        <div className="text-amber-400 font-bold text-lg">⚒ Forge #{state.forgeId}</div>
        <div className="text-xs text-[#6b4f2a] font-mono truncate max-w-xs">{state.owner}</div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-amber-400 font-bold">💰 {fmtSmelt(state.ingotBalance)} Ingots</span>
          <WalletMultiButton className="!bg-amber-700 !text-white !font-bold !rounded-lg !px-3 !py-1.5 !h-auto !text-xs" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Status message */}
        {msg && (
          <div className="rounded-xl border border-[#3d2b0f] bg-[#1a1208] px-4 py-3 text-sm text-amber-300">
            {msg}
          </div>
        )}

        {/* Construction banner */}
        {state.construction && (
          <div className="rounded-xl border border-amber-700 bg-[#2d1805] px-4 py-3 text-sm text-amber-300">
            🔨 Upgrading {BUILDING_META[state.construction.buildingType as BuildingType].label} to Lv{state.construction.toLevel} — {fmtCountdown(state.construction.completesAt)} remaining
          </div>
        )}

        {/* ── Buildings ── */}
        <section>
          <h2 className="text-amber-400 font-bold text-base uppercase tracking-wider mb-3">Buildings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_BUILDINGS.map(type => {
              const meta = BUILDING_META[type];
              const level = state.buildings[type] ?? 0;
              const toLevel = level + 1;
              const cost = level < 5 ? buildCost(type, toLevel) : 0;
              const isBuilding = state.construction?.buildingType === type;
              const canUpgrade = isOwner && level < 5 && !state.construction && state.ingotBalance >= cost && !busy;
              return (
                <div key={type} className={`rounded-xl border p-3 space-y-2 ${isBuilding ? 'border-amber-600 bg-[#2d1805]' : 'border-[#3d2b0f] bg-[#140e04]'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{meta.icon}</span>
                    <div>
                      <div className="text-[11px] font-bold text-amber-300">{meta.label}</div>
                      <div className="text-[9px] text-[#6b4f2a]">Lv {level} / 5</div>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= level ? 'bg-amber-500' : 'bg-[#2d1f0a]'}`} />
                    ))}
                  </div>
                  <div className="text-[9px] text-[#92724a] leading-tight">{meta.effectLabel}</div>
                  {level < 5 && isOwner && (
                    <button
                      onClick={() => handleBuild(type)}
                      disabled={!canUpgrade}
                      className="w-full text-[10px] font-bold rounded-lg py-1.5 transition-colors disabled:opacity-40 bg-[#2d1f0a] border border-[#78350f] text-amber-400 hover:border-amber-500 disabled:cursor-not-allowed"
                    >
                      {isBuilding
                        ? fmtCountdown(state.construction!.completesAt)
                        : `Lv${toLevel} — ${fmtSmelt(cost)} Ingots`}
                    </button>
                  )}
                  {level >= 5 && <div className="text-[9px] text-amber-600 font-bold text-center">MAX</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Troops ── */}
        <section>
          <h2 className="text-amber-400 font-bold text-base uppercase tracking-wider mb-1">Troops</h2>
          <p className="text-[11px] text-[#6b4f2a] mb-3">
            {totalStationed} / {state.troopCapacity} stationed
            {state.buildings['barracks'] < 1 && isOwner && (
              <span className="text-orange-400"> — build Barracks to train troops</span>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ALL_TROOPS.map(type => {
              const meta = TROOP_META[type];
              const qty = trainQty[type];
              const cost = meta.cost * qty;
              const canTrain = isOwner && state.buildings['barracks'] >= 1 && state.ingotBalance >= cost && !busy;
              return (
                <div key={type} className="rounded-xl border border-[#3d2b0f] bg-[#140e04] p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <div className="text-[11px] font-bold text-amber-300">{meta.label}</div>
                      <div className="text-[9px] text-[#6b4f2a]">Stationed: {state.troops[type as keyof TroopCount]}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                    <div className="bg-[#0f0c06] rounded p-1">
                      <div className="text-red-400 font-bold">{meta.atk}</div>
                      <div className="text-[#6b4f2a]">ATK</div>
                    </div>
                    <div className="bg-[#0f0c06] rounded p-1">
                      <div className="text-blue-400 font-bold">{meta.def}</div>
                      <div className="text-[#6b4f2a]">DEF</div>
                    </div>
                    <div className="bg-[#0f0c06] rounded p-1">
                      <div className="text-amber-400 font-bold">{meta.cost}</div>
                      <div className="text-[#6b4f2a]">Ingots</div>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1">
                      <input
                        type="number" min={1} max={20} value={qty}
                        onChange={e => setTrainQty(q => ({
                          ...q,
                          [type]: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                        }))}
                        className="w-12 bg-[#0f0c06] border border-[#3d2b0f] rounded px-1 text-[10px] text-amber-300 text-center"
                      />
                      <button
                        onClick={() => handleTrain(type)}
                        disabled={!canTrain}
                        className="flex-1 text-[10px] font-bold rounded-lg py-1.5 bg-[#1a2e12] border border-[#2d4a1e] text-green-400 hover:border-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Train ×{qty} — {fmtSmelt(cost)} Ingots
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Training queue */}
          {state.trainingQueue.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#3d2b0f] bg-[#0f0c06] p-3 space-y-1.5">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-2">Training Queue</div>
              {state.trainingQueue.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] text-[#92724a]">
                  <span>{TROOP_META[item.type as TroopType].icon} {item.quantity}× {TROOP_META[item.type as TroopType].label}</span>
                  <span className="text-amber-400 font-bold">{fmtCountdown(item.completesAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Attack Panel ── */}
        {state && state.buildings.rally_point >= 1 && (
          <section className="rounded-2xl border border-red-100 bg-red-50 p-5 space-y-4">
            <h2 className="font-bold text-red-900 text-sm">⚔️ Send Attack</h2>

            {/* Target input */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-28 flex-shrink-0">Target Forge ID</label>
              <input
                type="number"
                min={1}
                max={500}
                value={attackTarget}
                onChange={e => setAttackTarget(e.target.value)}
                placeholder="e.g. 42"
                className="w-24 rounded-lg border border-stone-200 px-2 py-1 text-sm text-center"
              />
            </div>

            {/* Troop selectors */}
            <div className="space-y-2">
              {ALL_TROOPS.map(t => {
                const meta = TROOP_META[t];
                const avail = state.troops[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-sm w-5">{meta.icon}</span>
                    <span className="text-xs text-gray-600 flex-1">{meta.label}</span>
                    <span className="text-xs text-gray-400">{avail} avail</span>
                    <input
                      type="number"
                      min={0}
                      max={avail}
                      value={sendQty[t]}
                      onChange={e => setSendQty(q => ({ ...q, [t]: Math.min(avail, Math.max(0, Number(e.target.value))) }))}
                      className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-sm text-center"
                    />
                  </div>
                );
              })}
            </div>

            {/* Attack message */}
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

            {/* Outgoing attacks queue */}
            {state.pendingAttacks.length > 0 && (
              <div className="border-t border-red-100 pt-3 space-y-1">
                <p className="text-[10px] text-red-700 font-semibold uppercase tracking-wide">Outgoing Attacks</p>
                {state.pendingAttacks.map((a: AttackRecord) => (
                  <div key={a.id} className="flex justify-between text-xs text-gray-600">
                    <span>→ Forge #{a.defenderForgeId}</span>
                    <span className="text-red-600 font-mono">{fmtCountdown(a.arrivesAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Inscription */}
        <div className="rounded-xl border border-[#2d1f0a] bg-[#0f0c06] px-4 py-3 text-xs text-[#92724a] italic leading-relaxed">
          {state.inscription}
        </div>
      </div>
    </div>
  );
}
