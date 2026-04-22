// app/treasury/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchStakeInfo } from '@/lib/smelt';
import { PageShell } from '@/components/PageShell';
import { PageHeading } from '@/components/PageHeading';

// ── Types ──────────────────────────────────────────────────────────────────────

interface StatsData {
  liquidations: {
    recent: Array<{ date: string; mint: string; solReceived: number }>;
    undistributedSol: number;
    totalSolReceived: number;
  };
  fees: {
    undistributedSol: number;
    totalCollected: number;
    totalAccountsClosed: number;
  };
  distributions: {
    totalSolDistributed: number;
  };
}

interface PoolData {
  nextDistributionAt: string;
  distributableSol: number;
  distributions: Array<{ date: string; totalSol: number; recipientCount: number }>;
}

interface DonationsData {
  totalSolDonated: number;
  donationCount: number;
  entries: Array<{ date: string; wallet: string; solDonated: number; distributed?: boolean }>;
}

interface VaultToken {
  mint: string;
  uiAmount: number;
  usdValue: number;
  pctOfThreshold: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtSol(n: number): string {
  return n.toFixed(4);
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Imminent';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCell({ label, value, sub, green }: { label: string; value: string; sub: string; green?: boolean }) {
  return (
    <div className="px-3 py-3.5 [&+&]:border-l border-gray-100">
      <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">{label}</div>
      <div className={`text-xl font-extrabold tracking-tight tabular-nums leading-none ${green ? 'text-green-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-gray-400 text-[10px] mt-1">{sub}</div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const { publicKey } = useWallet();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [donations, setDonations] = useState<DonationsData | null>(null);
  const [tokens, setTokens] = useState<VaultToken[]>([]);
  const [sharePct, setSharePct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [showAllDist, setShowAllDist] = useState(false);
  const [showAllLiq, setShowAllLiq] = useState(false);
  const [showAllDon, setShowAllDon] = useState(false);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [statsRes, poolRes, donationsRes, vaultRes] = await Promise.all([
        fetch('/api/stats', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/pool',  { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/donations', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        fetch('/api/vault', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      ]);
      if (statsRes) setStats(statsRes);
      if (poolRes)  setPoolData(poolRes);
      if (donationsRes) setDonations(donationsRes);
      if (vaultRes?.tokens) setTokens(vaultRes.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load treasury data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!publicKey) { setSharePct(0); return; }
    fetchStakeInfo(publicKey)
      .then(info => setSharePct(info?.sharePct ?? 0))
      .catch(() => {});
  }, [publicKey]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalFees       = stats?.fees.totalCollected ?? 0;
  const totalLiqSol     = stats?.liquidations.totalSolReceived ?? 0;
  const totalDonations  = donations?.totalSolDonated ?? 0;

  const undistFees      = stats?.fees.undistributedSol ?? 0;
  const undistLiq       = stats?.liquidations.undistributedSol ?? 0;
  const undistDonations = (donations?.entries ?? [])
    .filter(e => !e.distributed)
    .reduce((s, e) => s + e.solDonated, 0);

  const pendingTotal  = undistFees + undistLiq + undistDonations;
  const estShare      = sharePct > 0 ? (sharePct / 100) * pendingTotal : 0;

  const nextDistMs    = poolData ? new Date(poolData.nextDistributionAt).getTime() : 0;
  const msRemaining   = Math.max(0, nextDistMs - now);

  const allDistributions  = poolData?.distributions ?? [];
  const allLiq            = stats?.liquidations.recent ?? [];
  const allDonations      = [...(donations?.entries ?? [])].reverse();

  const distributions   = showAllDist ? allDistributions : allDistributions.slice(0, 3);
  const recentLiq       = showAllLiq  ? allLiq           : allLiq.slice(0, 3);
  const recentDonations = showAllDon  ? allDonations     : allDonations.slice(0, 3);
  const recentTokens    = tokens.slice(0, 3);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-sm text-gray-400">{error}</div>
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeading
        title="Treasury"
        subtitle="Protocol inflows, vault balance, and distribution history."
      />

      {/* Section 1 — Inflows strip */}
      <div className="grid grid-cols-3 border border-gray-100 bg-white rounded-2xl overflow-hidden shadow-sm mt-5">
        <StatCell label="Fees"         value={fmtSol(totalFees)}       sub="from recycling" />
        <StatCell label="Liquidations" value={fmtSol(totalLiqSol)}     sub="tokens → SOL" />
        <StatCell label="Donations"    value={fmtSol(totalDonations)}  sub="direct SOL" green />
      </div>

      {/* Section 2 — Pending vault */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
        <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-2">Pending distribution</div>
        <div className="text-4xl font-extrabold tracking-tight tabular-nums text-gray-900">
          {fmtSol(pendingTotal)}
          <span className="text-lg font-bold text-gray-400 ml-1">SOL</span>
        </div>
        <div className="text-xs text-gray-400 mt-2 leading-relaxed">
          {fmtSol(undistFees)} fees · {fmtSol(undistLiq)} liquidations · {fmtSol(undistDonations)} donations
        </div>
        {publicKey && estShare > 0 && (
          <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-sm text-green-700 font-bold">
            ~{estShare.toFixed(4)} SOL estimated for you
          </div>
        )}
        {publicKey && estShare === 0 && (
          <div className="mt-3 text-xs text-gray-400">Stake SMELT to earn a share of distributions.</div>
        )}
        {poolData && (
          <div className="mt-3 text-sm text-gray-500">
            Next distribution in{' '}
            <span className="font-bold text-green-600 inline-block tabular-nums" style={{ minWidth: '9ch' }}>
              {fmtCountdown(msRemaining)}
            </span>
          </div>
        )}
      </div>

      {/* Section 3 — Distribution history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
        <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Distribution history</div>
        {distributions.length === 0 ? (
          <div className="text-sm text-gray-400 py-2">No distributions yet.</div>
        ) : (
          <>
            {distributions.map((d, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{fmtDateShort(d.date)}</div>
                  <div className="text-[11px] text-gray-400">{d.recipientCount} recipients</div>
                </div>
                <div className="text-sm font-bold text-green-600 tabular-nums">{d.totalSol.toFixed(4)} SOL</div>
              </div>
            ))}
            {allDistributions.length > 3 && (
              <button onClick={() => setShowAllDist(v => !v)} className="w-full text-xs text-gray-400 hover:text-green-600 pt-2.5 text-center transition-colors">
                {showAllDist ? 'Show less' : `+${allDistributions.length - 3} more`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Section 4 — Recent liquidations */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
        <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Recent liquidations</div>
        {recentLiq.length === 0 ? (
          <div className="text-sm text-gray-400 py-2">No liquidations yet.</div>
        ) : (
          <>
            {recentLiq.map((liq, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
                <div>
                  <div className="text-sm font-semibold text-gray-900 font-mono">{shortAddr(liq.mint)}</div>
                  <div className="text-[11px] text-gray-400">{fmtDateShort(liq.date)}</div>
                </div>
                <div className="text-sm font-bold text-gray-700 tabular-nums">{liq.solReceived.toFixed(4)} SOL</div>
              </div>
            ))}
            {allLiq.length > 3 && (
              <button onClick={() => setShowAllLiq(v => !v)} className="w-full text-xs text-gray-400 hover:text-green-600 pt-2.5 text-center transition-colors">
                {showAllLiq ? 'Show less' : `+${allLiq.length - 3} more`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Section 5 — Donations */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
        <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Donations</div>
        {recentDonations.length === 0 ? (
          <div className="text-sm text-gray-400 py-2">No donations yet.</div>
        ) : (
          <>
            {recentDonations.map((d, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
                <div>
                  <div className="text-sm font-semibold text-gray-900 font-mono">{shortAddr(d.wallet)}</div>
                  <div className="text-[11px] text-gray-400">{fmtDateShort(d.date)}</div>
                </div>
                <div className="text-sm font-bold text-green-600 tabular-nums">{d.solDonated.toFixed(4)} SOL</div>
              </div>
            ))}
            {allDonations.length > 3 && (
              <button onClick={() => setShowAllDon(v => !v)} className="w-full text-xs text-gray-400 hover:text-green-600 pt-2.5 text-center transition-colors">
                {showAllDon ? 'Show less' : `+${allDonations.length - 3} more`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Section 6 — Vault token contents */}
      {recentTokens.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
          <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Vault contents</div>
          {recentTokens.map((token) => (
            <div key={token.mint} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
              <span className="text-sm font-mono text-gray-700">{shortAddr(token.mint)}</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">${token.usdValue.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

    </PageShell>
  );
}
