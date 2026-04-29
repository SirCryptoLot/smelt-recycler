// app/foundry/reports/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { GameNav } from '@/components/foundry/GameNav';
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

export default function ReportsPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [data, setData]           = useState<ReportsData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [, setTick]               = useState(0);
  const [selectedReport, setSelectedReport] = useState<AttackRecord | null>(null);
  const [unreadIds, setUnreadIds]           = useState<Set<string>>(new Set());

  const fetchReports = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/foundry/reports?wallet=${wallet}`);
      const json = await res.json() as ReportsData;
      setData(json);

      // Detect battles resolved since the user last viewed this page.
      // localStorage holds the ISO timestamp of the last visit.
      const lastSeenIso = localStorage.getItem('foundry:reports:lastSeen');
      const lastSeen = lastSeenIso ? new Date(lastSeenIso).getTime() : 0;
      const fresh = (json.reports ?? [])
        .filter(r => r.resolvedAt && new Date(r.resolvedAt).getTime() > lastSeen)
        .map(r => r.id);
      setUnreadIds(new Set(fresh));
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Mark all as read — called when user dismisses the banner or opens a report.
  const markAllRead = useCallback(() => {
    localStorage.setItem('foundry:reports:lastSeen', new Date().toISOString());
    setUnreadIds(new Set());
  }, []);

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

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 96px' }}>

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

        {/* Fresh-battle banner — slide-in when battles resolved since last visit */}
        {connected && !loading && unreadIds.size > 0 && (
          <div
            onClick={markAllRead}
            style={{
              background: 'linear-gradient(180deg, #2d2008, #1a1404)',
              border: `1px solid ${GOLD}66`,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer',
              boxShadow: `0 0 18px ${GOLD}22`,
              animation: 'fresh-pulse 2s ease-in-out infinite',
            }}
          >
            <span style={{ fontSize: 18 }}>⚔️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, flex: 1 }}>
              {unreadIds.size} new battle{unreadIds.size === 1 ? '' : 's'} resolved
            </span>
            <span style={{ fontSize: 16, color: GOLD, opacity: 0.6 }}>✕</span>
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

              const isUnread = unreadIds.has(r.id);
              const clickable = !isPending;
              return (
                <div
                  key={r.id}
                  onClick={clickable ? () => { setSelectedReport(r); markAllRead(); } : undefined}
                  role={clickable ? 'button' : undefined}
                  style={{
                    background: cardBg,
                    border: `1px solid ${isUnread ? GOLD : cardBorder}`,
                    boxShadow: isUnread ? `0 0 14px ${GOLD}33` : 'none',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 0,
                    cursor: clickable ? 'pointer' : 'default',
                    transition: 'transform 0.12s ease, border-color 0.18s ease',
                    position: 'relative',
                  }}
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

      <GameNav forgeId={data?.forgeId ?? null} />

      {selectedReport && data && (
        <BattleDetailModal
          report={selectedReport}
          myForgeId={data.forgeId}
          onClose={() => setSelectedReport(null)}
        />
      )}

      <style>{`
        @keyframes fresh-pulse {
          0%, 100% { box-shadow: 0 0 14px ${GOLD}22; }
          50%      { box-shadow: 0 0 22px ${GOLD}55; }
        }
      `}</style>
    </div>
  );
}

// ── Battle detail modal ──────────────────────────────────────────────────────

function BattleDetailModal({
  report, myForgeId, onClose,
}: { report: AttackRecord; myForgeId: number; onClose: () => void }) {
  const isAttacker = report.attackerForgeId === myForgeId;
  const won =
    (isAttacker && report.outcome === 'attacker_wins') ||
    (!isAttacker && report.outcome === 'defender_wins');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16, backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d1409', border: `1px solid ${won ? '#1a4a20' : '#4a1a1a'}`,
          borderRadius: 16, maxWidth: 420, width: '100%', overflow: 'hidden',
          boxShadow: '0 28px 80px rgba(0,0,0,0.85)',
        }}
      >
        {/* Header — outcome banner */}
        <div style={{
          padding: '18px 20px', textAlign: 'center',
          background: won
            ? 'linear-gradient(180deg, #0e3a18, #082010)'
            : 'linear-gradient(180deg, #3a0e0e, #200808)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>{won ? '🏆' : '💀'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: won ? '#80e080' : '#ff8080', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {won ? 'Victory' : 'Defeat'}
          </div>
          <div style={{ fontSize: 12, color: TEXT, marginTop: 4 }}>
            {isAttacker
              ? `Your raid on Forge #${report.defenderForgeId}`
              : `Forge #${report.attackerForgeId} raided you`}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 18px 18px' }}>

          {/* Loot row */}
          {report.ingotStolen > 0 && (
            <div style={{
              background: isAttacker ? '#0e1e0e' : '#1a0e0e',
              border: `1px solid ${isAttacker ? '#1a4a20' : '#4a1a1a'}`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {isAttacker ? 'Loot' : 'Lost'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isAttacker ? '#80e080' : '#ff8080' }}>
                  {isAttacker ? '+' : '−'}{report.ingotStolen.toLocaleString()} Ingots
                </div>
              </div>
            </div>
          )}

          {/* Casualty matrix */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
              Casualties
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Casualty label="Sent" troops={report.sentTroops} muted />
              <Casualty label="Atk lost" troops={report.attackerLosses} negative={isAttacker} />
              <Casualty label="Def lost" troops={report.defenderLosses} negative={!isAttacker} />
            </div>
          </div>

          {/* Timestamps */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUTED }}>
            <span>Launched {fmtDate(report.createdAt)}</span>
            {report.resolvedAt && <span>Resolved {fmtDate(report.resolvedAt)}</span>}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              marginTop: 16, width: '100%', padding: '11px 0', borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: '#1a2a10', border: `1px solid ${BORDER}`, color: TEXT,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Casualty({
  label, troops, muted, negative,
}: { label: string; troops: { smelters: number; ash_archers: number; iron_guards: number }; muted?: boolean; negative?: boolean }) {
  const total = troops.smelters + troops.ash_archers + troops.iron_guards;
  const color = muted ? DIM : negative ? '#e06060' : TEXT;
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.1 }}>{total}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>
        <TroopSummary t={troops} />
      </div>
    </div>
  );
}
