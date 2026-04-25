// app/foundry/reports/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { AttackRecord } from '@/lib/foundry-combat';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtCountdown(iso: string): string {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  if (secs === 0) return 'Resolving…';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function TroopSummary({ t }: { t: { smelters: number; ash_archers: number; iron_guards: number } }) {
  const parts = [
    t.smelters    > 0 && `${t.smelters}⚔️`,
    t.ash_archers > 0 && `${t.ash_archers}🏹`,
    t.iron_guards > 0 && `${t.iron_guards}🛡️`,
  ].filter(Boolean);
  return <>{parts.length > 0 ? parts.join(' ') : '—'}</>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface ReportsData {
  forgeId: number;
  reports: AttackRecord[];
}

export default function ReportsPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [data, setData]           = useState<ReportsData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [, setTick]               = useState(0);

  const fetchReports = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/foundry/reports?wallet=${wallet}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // 1-second tick for countdown timers
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">⚔️ Battle Reports</h1>
          {data && <p className="text-gray-400 text-sm mt-0.5">Forge #{data.forgeId}</p>}
        </div>
        <Link href="/foundry" className="text-xs text-gray-400 hover:underline">← Back to map</Link>
      </div>

      {!connected && (
        <div className="space-y-3 text-center py-16">
          <p className="text-gray-500 text-sm">Connect your wallet to view battle reports</p>
          <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm" />
        </div>
      )}

      {connected && loading && (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      )}

      {connected && !loading && data && data.reports.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-200 py-16 text-center text-gray-400 text-sm">
          No battles yet. Send your first attack from your{' '}
          <Link href={`/foundry/forge/${data.forgeId}`} className="text-amber-600 hover:underline">
            forge page
          </Link>.
        </div>
      )}

      {connected && !loading && data && data.reports.length > 0 && (
        <div className="space-y-3">
          {data.reports.map(r => {
            const isPending = r.resolvedAt === null;
            const isAttacker = r.attackerForgeId === data.forgeId;
            const won =
              (isAttacker && r.outcome === 'attacker_wins') ||
              (!isAttacker && r.outcome === 'defender_wins');

            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 ${
                  isPending
                    ? 'border-amber-200 bg-amber-50'
                    : won
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-100 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold text-gray-800">
                    {isAttacker
                      ? `Forge #${r.attackerForgeId} attacked Forge #${r.defenderForgeId}`
                      : `Forge #${r.attackerForgeId} attacked your Forge #${r.defenderForgeId}`}
                  </div>
                  {isPending ? (
                    <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                      Arriving {fmtCountdown(r.arrivesAt)}
                    </span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      won
                        ? 'bg-green-200 text-green-800'
                        : 'bg-red-200 text-red-800'
                    }`}>
                      {won ? 'Victory' : 'Defeat'}
                    </span>
                  )}
                </div>

                {!isPending && (
                  <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 mt-1">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Sent</p>
                      <TroopSummary t={r.sentTroops} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Atk Losses</p>
                      <TroopSummary t={r.attackerLosses} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Def Losses</p>
                      <TroopSummary t={r.defenderLosses} />
                    </div>
                  </div>
                )}

                {!isPending && r.smeltStolen > 0 && (
                  <p className={`text-xs mt-2 font-semibold ${isAttacker ? 'text-green-700' : 'text-red-700'}`}>
                    {isAttacker
                      ? `+${r.smeltStolen.toLocaleString()} SMELT stolen`
                      : `−${r.smeltStolen.toLocaleString()} SMELT raided`}
                  </p>
                )}

                <p className="text-[10px] text-gray-400 mt-2">
                  {isPending ? `Launched ${fmtDate(r.createdAt)}` : fmtDate(r.resolvedAt!)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
