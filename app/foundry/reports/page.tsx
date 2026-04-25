// app/foundry/reports/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { AttackRecord } from '@/lib/foundry-combat';

const BG     = '#0d1409';
const CARD   = '#111a09';
const BORDER = '#1e2d10';
const GOLD   = '#d4a438';
const DIM    = '#4a6a2a';
const TEXT   = '#d8c89a';
const MUTED  = '#3a5020';

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

const NAV_LINKS = [
  { icon: '🗺️', label: 'Map',      href: '/foundry' },
  { icon: '🏗️', label: 'Forge',    href: '/foundry' },
  { icon: '⚗️', label: 'Exchange', href: '/foundry/exchange' },
  { icon: '📜', label: 'Reports',  href: '/foundry/reports', active: true },
  { icon: '🛒', label: 'Store',    href: '/foundry/store' },
];

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
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'inherit' }}>
      {/* Dark header */}
      <div style={{ background: 'rgba(0,0,0,0.85)', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>📜</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>Battle Reports</span>
        {data && (
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ background: '#1e2d10', border: `1px solid ${BORDER}`, borderRadius: 9999, padding: '3px 10px', fontSize: 12, color: GOLD }}>
              Forge #{data.forgeId}
            </div>
          </div>
        )}
      </div>

      {/* Nav tab bar */}
      <div style={{ background: '#080c05', borderBottom: `1px solid ${BORDER}`, display: 'flex' }}>
        {NAV_LINKS.map(n => (
          <Link key={n.label} href={n.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 4px', textDecoration: 'none', borderBottom: n.active ? `2px solid ${GOLD}` : '2px solid transparent' }}>
            <span style={{ fontSize: 17 }}>{n.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: n.active ? GOLD : MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{n.label}</span>
          </Link>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>

        {/* Not connected */}
        {!connected && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 16 }}>Connect wallet to view battle reports</p>
            <WalletMultiButton className="!bg-green-600 !text-white !font-bold !rounded-xl !px-4 !py-2 !h-auto !text-sm" />
          </div>
        )}

        {/* Loading skeletons */}
        {connected && loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, height: 80, opacity: 0.5 }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {connected && !loading && data && data.reports.length === 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 6 }}>No battles yet.</p>
            <p style={{ color: MUTED, fontSize: 12 }}>
              Send your first attack from your{' '}
              <Link href={`/foundry/forge/${data.forgeId}`} style={{ color: GOLD, textDecoration: 'underline' }}>
                forge page
              </Link>.
            </p>
          </div>
        )}

        {/* Report cards */}
        {connected && !loading && data && data.reports.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.reports.map(r => {
              const isPending  = r.resolvedAt === null;
              const isAttacker = r.attackerForgeId === data.forgeId;
              const won =
                (isAttacker && r.outcome === 'attacker_wins') ||
                (!isAttacker && r.outcome === 'defender_wins');

              const cardBg     = isPending ? '#1c1608' : won ? '#0e1e0e' : '#1a0e0e';
              const cardBorder = isPending ? '#6a4a10' : won ? '#1a4a20' : '#4a1a1a';

              return (
                <div
                  key={r.id}
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, padding: '12px 14px', marginBottom: 0 }}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                      {isAttacker
                        ? `⚔️ Forge #${r.attackerForgeId} attacked Forge #${r.defenderForgeId}`
                        : `🛡 Forge #${r.attackerForgeId} attacked your Forge #${r.defenderForgeId}`}
                    </div>
                    {isPending ? (
                      <span style={{ background: '#3d2808', color: '#e8a020', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                        Arriving {fmtCountdown(r.arrivesAt)}
                      </span>
                    ) : (
                      <span style={{
                        background: won ? '#0e2d14' : '#2d0e0e',
                        color: won ? '#60c060' : '#e06060',
                        borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8,
                      }}>
                        {won ? 'Victory' : 'Defeat'}
                      </span>
                    )}
                  </div>

                  {/* Troop grid */}
                  {!isPending && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>Sent</div>
                        <div style={{ fontSize: 11, color: DIM }}><TroopSummary t={r.sentTroops} /></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>Atk Losses</div>
                        <div style={{ fontSize: 11, color: DIM }}><TroopSummary t={r.attackerLosses} /></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 2 }}>Def Losses</div>
                        <div style={{ fontSize: 11, color: DIM }}><TroopSummary t={r.defenderLosses} /></div>
                      </div>
                    </div>
                  )}

                  {/* Ingots stolen */}
                  {!isPending && r.ingotStolen > 0 && (
                    <p style={{ fontSize: 12, fontWeight: 700, color: isAttacker ? '#60c060' : '#e06060', marginBottom: 4 }}>
                      {isAttacker
                        ? `+${r.ingotStolen.toLocaleString()} Ingots stolen`
                        : `−${r.ingotStolen.toLocaleString()} Ingots raided`}
                    </p>
                  )}

                  {/* Date footer */}
                  <p style={{ fontSize: 10, color: MUTED }}>
                    {isPending ? `Launched ${fmtDate(r.createdAt)}` : fmtDate(r.resolvedAt!)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
