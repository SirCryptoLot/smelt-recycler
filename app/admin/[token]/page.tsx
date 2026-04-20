// app/admin/[token]/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Section = 'overview' | 'vault' | 'actions' | 'smelt' | 'history' | 'stakers' | 'donations' | 'referrals' | 'seed';

interface VaultToken { mint: string; uiAmount: number; usdValue: number; pctOfThreshold: number; }
interface LiquidationEntry { date: string; mint: string; solReceived: number; distributed: boolean; }
interface DistributionEntry { date: string; totalSol: number; recipientCount: number; txSignatures: string[]; }

interface AdminStats {
  vault: { tokens: VaultToken[]; totalUsd: number };
  smelt: { supply: number; epochRate: number; currentEpoch: number; msUntilHalving: number; nav: number };
  fees: { totalCollected: number; undistributedSol: number; totalAccountsClosed: number };
  liquidations: { recent: LiquidationEntry[]; undistributedSol: number };
  distributions: { recent: DistributionEntry[]; totalSolDistributed: number; lastDistribution: DistributionEntry | null; nextDistributionDate: string | null };
  pending: { totalSol: number };
}

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview',  icon: '📊' },
  { id: 'vault',     label: 'Vault',     icon: '🏦' },
  { id: 'actions',   label: 'Actions',   icon: '⚡' },
  { id: 'smelt',     label: 'SMELT',     icon: '🪙' },
  { id: 'history',   label: 'History',   icon: '📜' },
  { id: 'stakers',   label: 'Stakers',   icon: '👥' },
  { id: 'donations', label: 'Donations', icon: '💚' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
  { id: 'seed',      label: 'Seed',      icon: '🗄' },
];

function shortAddr(addr: string) { return `${addr.slice(0, 8)}…${addr.slice(-6)}`; }
function formatDate(iso: string) { return new Date(iso).toLocaleString(); }
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Halving now!';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

export default function AdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionOutput, setActionOutput] = useState('No output yet.');
  const [actionRunning, setActionRunning] = useState(false);
  const [stakersData, setStakersData] = useState<{
    totalStakedUi: number;
    stakerCount: number;
    epochStart: string;
    stakers: Array<{
      wallet: string;
      stakedUi: number;
      sharePct: number;
      depositedAt: string;
      cooldownStartedAt: string | null;
      status: 'active' | 'cooldown' | 'ready_to_unstake';
    }>;
  } | null>(null);
  const [donationsData, setDonationsData] = useState<{
    totalSolDonated: number;
    donationCount: number;
    entries: Array<{
      date: string;
      wallet: string;
      solDonated: number;
      distributed?: boolean;
      txSignature?: string;
    }>;
  } | null>(null);
  const [referralsData, setReferralsData] = useState<{
    totalReferralEvents: number;
    uniqueReferrers: number;
    totalPendingSOL: number;
    topReferrers: Array<{ wallet: string; count: number; pendingSOL: number; totalEarned: number; code: string }>;
  } | null>(null);
  const [seedFile, setSeedFile] = useState('fees.json');
  const [seedJson, setSeedJson] = useState('');
  const [seedMsg, setSeedMsg] = useState('');
  const [seedRunning, setSeedRunning] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store', headers: { 'x-admin-secret': token } });
      if (res.status === 401) { setAuthorized(false); return; }
      if (!res.ok) return;
      setData(await res.json() as AdminStats);
      setAuthorized(true);
      setLastUpdated(new Date());
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(() => refresh(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const runAction = useCallback(async (phase: 'liquidate' | 'distribute' | 'all') => {
    setActionRunning(true);
    setActionOutput(`Running ${phase}...\n`);
    setSection('actions');
    try {
      const res = await fetch('/api/admin/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': token },
        body: JSON.stringify({ phase }),
      });
      const json = await res.json() as { ok: boolean; log?: string[]; error?: string };
      setActionOutput((json.log ?? []).join('\n') || json.error || 'Done (no output).');
      if (json.ok) refresh(true);
    } catch (e) {
      setActionOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionRunning(false);
    }
  }, [token, refresh]);

  const fetchStakers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stakers', {
        headers: { 'x-admin-secret': token },
        cache: 'no-store',
      });
      if (res.ok) setStakersData(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const fetchDonations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/donations', {
        headers: { 'x-admin-secret': token },
        cache: 'no-store',
      });
      if (res.ok) setDonationsData(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/referrals', {
        headers: { 'x-admin-secret': token },
        cache: 'no-store',
      });
      if (res.ok) setReferralsData(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const navigate = useCallback((id: Section) => {
    setSection(id);
    setSidebarOpen(false);
    if (id === 'stakers')   fetchStakers();
    if (id === 'donations') fetchDonations();
    if (id === 'referrals') fetchReferrals();
  }, [fetchStakers, fetchDonations, fetchReferrals]);

  // Unauthorized
  if (authorized === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060f0d] text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">404</div>
          <div className="text-zinc-500 text-sm">Page not found</div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060f0d] text-white">
        <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const d = data!;

  return (
    <div className="flex h-screen bg-[#060f0d] text-white overflow-hidden">

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Admin sidebar */}
      <aside
        style={isMobile ? {
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: 50,
          width: '200px',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {
          position: 'relative',
          width: '144px',
          flexShrink: 0,
        }}
        className="flex flex-col border-r border-white/5 bg-[#09140f]"
      >
        <div className="px-4 pt-5 pb-4 border-b border-white/5 flex items-center justify-between">
          <div className="text-emerald-400 text-xs font-bold tracking-widest uppercase">⚙ Admin</div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-white/30 hover:text-white/60 text-lg leading-none p-1">✕</button>
          )}
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-2 pt-3">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left w-full',
                section === id
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              ].join(' ')}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5 space-y-2">
          {lastUpdated && (
            <div className="text-[10px] text-zinc-600 text-center">
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={() => {
              refresh();
              if (section === 'stakers')   fetchStakers();
              if (section === 'donations') fetchDonations();
              if (section === 'referrals') fetchReferrals();
            }}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-all"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Mobile top bar */}
        {isMobile && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white/50 hover:text-white transition-colors text-xl leading-none"
              aria-label="Open admin menu"
            >☰</button>
            <div className="text-emerald-400 text-xs font-bold tracking-widest uppercase">⚙ Admin</div>
            <div className="ml-auto text-xs text-zinc-500 capitalize">{section}</div>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {section === 'overview' && (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">Overview</h2>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'SMELT Supply', value: d.smelt.supply.toLocaleString(), sub: `Epoch ${d.smelt.currentEpoch}`, color: 'text-emerald-400' },
                { label: 'Vault Value', value: `$${d.vault.totalUsd.toFixed(2)}`, sub: `${d.vault.tokens.length} token${d.vault.tokens.length !== 1 ? 's' : ''}`, color: 'text-zinc-200' },
                { label: 'Pending SOL', value: d.pending.totalSol.toFixed(6), sub: 'Fees + liquidations', color: 'text-zinc-200' },
                { label: 'NAV / SMELT', value: `${d.smelt.nav.toFixed(6)} SOL`, sub: 'Pending pool ÷ supply', color: 'text-indigo-400' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="text-xs text-zinc-500 mb-1">{label}</div>
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-sm font-semibold text-zinc-200 mb-1">⚡ Liquidate</div>
                <div className="text-xs text-zinc-500 mb-3">
                  Swap all vault tokens with non-zero balance to SOL via Jupiter.
                  {d.vault.tokens.some((t) => t.uiAmount > 0) && (
                    <span className="text-emerald-400 font-semibold"> {d.vault.tokens.filter(t => t.uiAmount > 0).length} token(s) ready.</span>
                  )}
                </div>
                <button
                  onClick={() => runAction('liquidate')}
                  disabled={actionRunning}
                  className="w-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-2 rounded-xl hover:bg-emerald-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? 'Running…' : '▶ Run Liquidation'}
                </button>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-sm font-semibold text-zinc-200 mb-1">💸 Distribute</div>
                <div className="text-xs text-zinc-500 mb-3">
                  Send {d.pending.totalSol.toFixed(6)} SOL proportionally to all eligible SMELT stakers.
                </div>
                <button
                  onClick={() => runAction('distribute')}
                  disabled={actionRunning || d.pending.totalSol === 0}
                  className="w-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold py-2 rounded-xl hover:bg-blue-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? 'Running…' : '▶ Run Distribution'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── VAULT ── */}
        {section === 'vault' && (
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Vault Contents</h2>
            {d.vault.tokens.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-zinc-500 text-sm">
                Vault is empty — no tokens accumulated yet.
              </div>
            ) : (
              <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500 text-xs">
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-right px-4 py-3">Balance</th>
                      <th className="text-right px-4 py-3">USD Value</th>
                      <th className="px-4 py-3 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.vault.tokens.map((t) => (
                      <tr key={t.mint} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{shortAddr(t.mint)}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{t.uiAmount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">
                          ${t.usdValue.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {t.uiAmount > 0
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">READY</span>
                            : <span className="text-zinc-600">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIONS ── */}
        {section === 'actions' && (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">
                <div className="text-sm font-semibold text-zinc-200">⚡ Liquidation</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  Swaps all non-zero vault token balances to SOL via Jupiter (no minimum threshold).
                  Results saved to <code className="text-zinc-300">data/liquidations.json</code>.
                </div>
                <button
                  onClick={() => runAction('liquidate')}
                  disabled={actionRunning}
                  className="w-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-2.5 rounded-xl hover:bg-emerald-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? '⏳ Running…' : '▶ Run Liquidation'}
                </button>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">
                <div className="text-sm font-semibold text-zinc-200">💸 Distribution</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  Distributes vault SOL proportionally to all eligible stakers.
                  Sends in batches of 18 per transaction.
                  Logs results to <code className="text-zinc-300">data/distributions.json</code>.
                </div>
                <button
                  onClick={() => runAction('distribute')}
                  disabled={actionRunning || d.pending.totalSol === 0}
                  className="w-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold py-2.5 rounded-xl hover:bg-blue-500/25 disabled:opacity-40 transition-all"
                >
                  {actionRunning ? '⏳ Running…' : '▶ Run Distribution'}
                </button>
                {d.pending.totalSol === 0 && (
                  <p className="text-xs text-zinc-600">No pending SOL to distribute.</p>
                )}
              </div>
            </div>

            {/* Terminal output */}
            <div className="rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/10 text-xs text-zinc-500 font-mono">
                Output {actionRunning && <span className="text-emerald-400 animate-pulse">● running</span>}
              </div>
              <pre className="p-4 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-80">
                {actionOutput}
              </pre>
            </div>
          </div>
        )}

        {/* ── SMELT ── */}
        {section === 'smelt' && (
          <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-lg font-bold text-zinc-100">SMELT Token</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Circulating Supply', value: d.smelt.supply.toLocaleString() + ' SMELT', color: 'text-emerald-400' },
                { label: 'Current Epoch', value: `#${d.smelt.currentEpoch}`, color: 'text-zinc-200' },
                { label: 'Emission Rate', value: `${d.smelt.epochRate} SMELT / account`, color: 'text-zinc-200' },
                { label: 'Next Halving', value: formatCountdown(d.smelt.msUntilHalving), color: 'text-amber-400' },
                { label: 'NAV', value: `${d.smelt.nav.toFixed(6)} SOL / SMELT`, color: 'text-indigo-400' },
                { label: 'Pending Pool', value: `${d.pending.totalSol.toFixed(6)} SOL`, color: 'text-zinc-200' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="text-xs text-zinc-500 mb-1">{label}</div>
                  <div className={`text-lg font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-300">NAV explained:</strong> The Net Asset Value is the pending SOL pool
              divided by circulating supply. It represents what each SMELT token is currently worth if all
              pending SOL were distributed today. NAV grows as more accounts are recycled and vault tokens are liquidated.
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {section === 'history' && (
          <div className="p-4 sm:p-6 space-y-8">
            <h2 className="text-lg font-bold text-zinc-100">History</h2>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-300">Recent Liquidations</h3>
              {d.liquidations.recent.length === 0 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No liquidations yet.</div>
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 text-xs">
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Token</th>
                        <th className="text-right px-4 py-3">SOL Received</th>
                        <th className="text-center px-4 py-3">Distributed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.liquidations.recent.map((l, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(l.date)}</td>
                          <td className="px-4 py-3 font-mono text-zinc-300 text-xs">{shortAddr(l.mint)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">{l.solReceived.toFixed(6)}</td>
                          <td className="px-4 py-3 text-center">{l.distributed ? '✓' : '·'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-300">Recent Distributions</h3>
              {d.distributions.recent.length === 0 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No distributions yet.</div>
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 text-xs">
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">SOL Sent</th>
                        <th className="text-right px-4 py-3">Recipients</th>
                        <th className="text-right px-4 py-3">Txs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.distributions.recent.map((dist, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(dist.date)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">{dist.totalSol.toFixed(6)}</td>
                          <td className="px-4 py-3 text-right text-zinc-300">{dist.recipientCount}</td>
                          <td className="px-4 py-3 text-right text-xs space-y-0.5">
                            {dist.txSignatures.map((sig, j) => (
                              <a key={j} href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener noreferrer"
                                 className="block font-mono text-zinc-500 hover:text-emerald-400 transition-colors">
                                {sig.slice(0, 8)}…
                              </a>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── STAKERS ── */}
        {section === 'stakers' && (
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Stakers</h2>
            {!stakersData ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Staked', value: `${stakersData.totalStakedUi.toLocaleString()} SMELT` },
                    { label: 'Stakers', value: String(stakersData.stakerCount) },
                    { label: 'Epoch Start', value: new Date(stakersData.epochStart).toLocaleDateString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="text-xs text-zinc-500 mb-1">{label}</div>
                      <div className="text-sm font-bold text-zinc-200">{value}</div>
                    </div>
                  ))}
                </div>
                {stakersData.stakers.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No stakers yet.</div>
                ) : (
                  <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-500 text-xs">
                            <th className="text-left px-4 py-3">#</th>
                            <th className="text-left px-4 py-3">Wallet</th>
                            <th className="text-right px-4 py-3">Staked</th>
                            <th className="text-right px-4 py-3">Share</th>
                            <th className="text-right px-4 py-3">Since</th>
                            <th className="text-center px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stakersData.stakers.map((s, i) => (
                            <tr key={s.wallet} className="border-b border-white/5 last:border-0">
                              <td className="px-4 py-3 text-zinc-600 text-xs">{i + 1}</td>
                              <td className="px-4 py-3 font-mono text-zinc-300 text-xs">
                                <a href={`https://solscan.io/account/${s.wallet}`} target="_blank" rel="noopener noreferrer"
                                   className="hover:text-emerald-400 transition-colors">
                                  {shortAddr(s.wallet)}
                                </a>
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">
                                {s.stakedUi.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-400 text-xs tabular-nums">
                                {s.sharePct.toFixed(2)}%
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                                {new Date(s.depositedAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {s.status === 'active' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Active</span>
                                )}
                                {s.status === 'cooldown' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">Cooldown</span>
                                )}
                                {s.status === 'ready_to_unstake' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Ready</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── DONATIONS ── */}
        {section === 'donations' && (
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Donations</h2>
            {!donationsData ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-zinc-500 mb-1">Total Donated</div>
                    <div className="text-lg font-bold text-emerald-400">{donationsData.totalSolDonated.toFixed(4)} SOL</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-zinc-500 mb-1">Pending (undistributed)</div>
                    <div className="text-lg font-bold text-amber-400">
                      {donationsData.entries.filter(e => !e.distributed).reduce((s, e) => s + e.solDonated, 0).toFixed(4)} SOL
                    </div>
                  </div>
                </div>
                {donationsData.entries.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No donations yet.</div>
                ) : (
                  <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-500 text-xs">
                            <th className="text-left px-4 py-3">Date</th>
                            <th className="text-left px-4 py-3">Wallet</th>
                            <th className="text-right px-4 py-3">SOL</th>
                            <th className="text-center px-4 py-3">Status</th>
                            <th className="text-right px-4 py-3">Tx</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...donationsData.entries].reverse().map((d, i) => (
                            <tr key={i} className="border-b border-white/5 last:border-0">
                              <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(d.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono text-zinc-300 text-xs">
                                <a href={`https://solscan.io/account/${d.wallet}`} target="_blank" rel="noopener noreferrer"
                                   className="hover:text-emerald-400 transition-colors">
                                  {shortAddr(d.wallet)}
                                </a>
                              </td>
                              <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">{d.solDonated.toFixed(4)}</td>
                              <td className="px-4 py-3 text-center">
                                {d.distributed
                                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Distributed</span>
                                  : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Pending</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-right text-xs">
                                {d.txSignature ? (
                                  <a href={`https://solscan.io/tx/${d.txSignature}`} target="_blank" rel="noopener noreferrer"
                                     className="font-mono text-zinc-500 hover:text-emerald-400 transition-colors">
                                    {d.txSignature.slice(0, 8)}…
                                  </a>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── REFERRALS ── */}
        {section === 'referrals' && (
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Referrals</h2>
            {!referralsData ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-zinc-500 mb-1">Total referrals</div>
                    <div className="text-lg font-bold text-zinc-100">{referralsData.totalReferralEvents}</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-zinc-500 mb-1">Unique referrers</div>
                    <div className="text-lg font-bold text-zinc-100">{referralsData.uniqueReferrers}</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-zinc-500 mb-1">Pending payout</div>
                    <div className="text-lg font-bold text-amber-400">{referralsData.totalPendingSOL.toFixed(6)} SOL</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-zinc-500 leading-relaxed">
                  SOL bonuses are paid automatically during the next cron distribution run. SMELT bonuses are minted immediately when a referral is recorded.
                </div>
                {referralsData.topReferrers.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5 text-zinc-500 text-sm">No referrals yet.</div>
                ) : (
                  <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-500 text-xs">
                            <th className="text-left px-4 py-3">#</th>
                            <th className="text-left px-4 py-3">Wallet</th>
                            <th className="text-center px-4 py-3">Code</th>
                            <th className="text-right px-4 py-3">Referrals</th>
                            <th className="text-right px-4 py-3">Pending SOL</th>
                            <th className="text-right px-4 py-3">Total Earned</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referralsData.topReferrers.map((r, i) => (
                            <tr key={r.wallet} className="border-b border-white/5 last:border-0">
                              <td className="px-4 py-3 text-zinc-600 text-xs">{i + 1}</td>
                              <td className="px-4 py-3 font-mono text-zinc-300 text-xs">
                                <a href={`https://solscan.io/account/${r.wallet}`} target="_blank" rel="noopener noreferrer"
                                   className="hover:text-emerald-400 transition-colors">
                                  {shortAddr(r.wallet)}
                                </a>
                              </td>
                              <td className="px-4 py-3 text-center font-mono font-bold text-emerald-400 tracking-widest text-sm">{r.code}</td>
                              <td className="px-4 py-3 text-right text-zinc-300">{r.count}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-amber-400">{r.pendingSOL.toFixed(6)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{r.totalEarned.toFixed(6)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SEED ── */}
        {section === 'seed' && (
          <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Seed / Restore Data</h2>
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-300 leading-relaxed">
              ⚠ This overwrites data files on the server. Use only to restore after a Railway redeploy wipes the filesystem. Paste valid JSON arrays only.
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Target file</label>
                <select
                  value={seedFile}
                  onChange={e => setSeedFile(e.target.value)}
                  className="bg-zinc-900 border border-white/10 text-zinc-200 text-sm rounded-xl px-3 py-2 w-full focus:outline-none focus:border-emerald-500/50"
                >
                  {['fees.json','donations.json','liquidations.json','distributions.json','leaderboard.json','ecosystem.json'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">JSON content</label>
                <textarea
                  value={seedJson}
                  onChange={e => setSeedJson(e.target.value)}
                  rows={10}
                  placeholder='[{"date":"..."}]'
                  className="w-full bg-zinc-950 border border-white/10 text-zinc-300 text-xs font-mono rounded-xl p-3 focus:outline-none focus:border-emerald-500/50 resize-y"
                />
              </div>
              <button
                disabled={seedRunning || !seedJson.trim()}
                onClick={async () => {
                  setSeedRunning(true);
                  setSeedMsg('');
                  try {
                    let parsed: unknown;
                    try { parsed = JSON.parse(seedJson); } catch { setSeedMsg('Invalid JSON'); setSeedRunning(false); return; }
                    const res = await fetch('/api/admin/seed', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-admin-secret': token },
                      body: JSON.stringify({ files: { [seedFile]: parsed } }),
                    });
                    const json = await res.json() as { ok?: boolean; written?: string[]; error?: string };
                    setSeedMsg(json.ok ? `✓ Wrote: ${json.written?.join(', ')}` : (json.error ?? 'Failed'));
                  } catch (e) {
                    setSeedMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setSeedRunning(false);
                  }
                }}
                className="w-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold py-2.5 rounded-xl hover:bg-amber-500/25 disabled:opacity-40 transition-all"
              >
                {seedRunning ? '⏳ Writing…' : `▶ Write ${seedFile}`}
              </button>
              {seedMsg && (
                <div className={`text-xs rounded-xl px-3 py-2 ${seedMsg.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {seedMsg}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
