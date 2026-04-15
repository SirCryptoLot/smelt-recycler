// app/stake/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { fetchSmeltBalance, buildStakeTransaction } from '@/lib/smelt';
import { COOLDOWN_DAYS } from '@/lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PoolData {
  totalSmeltStakedUi: number;
  stakerCount: number;
  epochStart: string;
  nextDistributionAt: string;
  vaultSolBalance: number;
  distributableSol: number;
  distributions: Array<{ date: string; totalSol: number; recipientCount: number }>;
}

interface StakeData {
  staked: string;
  stakedUi: number;
  sharePct: number;
  depositedAt: string | null;
  cooldownStartedAt: string | null;
  epochStart: string;
  totalSmeltStaked: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSmelt(ui: number): string {
  if (ui >= 1_000_000) return `${(ui / 1_000_000).toFixed(1)}M`;
  if (ui >= 1_000) return `${(ui / 1_000).toFixed(1)}K`;
  return ui.toFixed(0);
}

function fmtSmeltFull(ui: number): string {
  return ui.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Imminent';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-900">{children}</span>
    </div>
  );
}

function StatusPill({ stakeData, poolData, now }: { stakeData: StakeData; poolData: PoolData | null; now: number }) {
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  if (stakeData.cooldownStartedAt) {
    const elapsed = now - new Date(stakeData.cooldownStartedAt).getTime();
    if (elapsed >= cooldownMs) {
      return (
        <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-bold text-amber-700">
          Ready to unstake
        </span>
      );
    }
    const unlockAt = new Date(new Date(stakeData.cooldownStartedAt).getTime() + cooldownMs);
    return (
      <span className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 text-xs font-bold text-orange-700">
        Cooldown · unlocks {fmtDateShort(unlockAt.toISOString())}
      </span>
    );
  }

  const epochStart = poolData?.epochStart ?? stakeData.epochStart;
  if (stakeData.depositedAt && new Date(stakeData.depositedAt).getTime() >= new Date(epochStart).getTime()) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1 text-xs font-bold text-yellow-700">
        Waiting for next epoch
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Earning rewards
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StakePage() {
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [stakeData, setStakeData] = useState<StakeData | null>(null);
  const [walletSmelt, setWalletSmelt] = useState(0);
  const [stakeAmount, setStakeAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [poolError, setPoolError] = useState('');
  const [now, setNow] = useState(Date.now());

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshPool = useCallback(async () => {
    try {
      const res = await fetch('/api/pool');
      if (!res.ok) throw new Error('Failed');
      setPoolData(await res.json() as PoolData);
      setPoolError('');
    } catch {
      setPoolError('Could not load pool data.');
    }
  }, []);

  const refreshStake = useCallback(async () => {
    if (!publicKey) return;
    try {
      const [bal, res] = await Promise.all([
        fetchSmeltBalance(connection, publicKey),
        fetch(`/api/stake?wallet=${publicKey.toBase58()}`),
      ]);
      setWalletSmelt(Number(bal) / 1e9);
      if (res.ok) setStakeData(await res.json() as StakeData);
    } catch {
      // non-fatal
    }
  }, [publicKey, connection]);

  // Load pool on mount + refresh every 30s
  useEffect(() => {
    void refreshPool();
    const id = setInterval(() => { void refreshPool(); }, 30_000);
    return () => clearInterval(id);
  }, [refreshPool]);

  // Load stake data when wallet connects
  useEffect(() => {
    void refreshStake();
  }, [refreshStake]);

  // Derived epoch values (computed each render)
  const epochDurationMs = 48 * 60 * 60 * 1000;
  const epochStartMs = poolData ? new Date(poolData.epochStart).getTime() : 0;
  const nextDistMs = poolData ? new Date(poolData.nextDistributionAt).getTime() : 0;
  const epochProgress = poolData
    ? Math.min(100, Math.max(0, ((now - epochStartMs) / epochDurationMs) * 100))
    : 0;
  const msRemaining = Math.max(0, nextDistMs - now);

  const staked = stakeData?.stakedUi ?? 0;
  const sharePct = stakeData?.sharePct ?? 0;
  const estimatedReward = (sharePct / 100) * (poolData?.distributableSol ?? 0);
  const showEstimate = staked > 0 && !stakeData?.cooldownStartedAt;

  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const cooldownComplete = stakeData?.cooldownStartedAt
    ? now - new Date(stakeData.cooldownStartedAt).getTime() >= cooldownMs
    : false;

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleStake() {
    if (!publicKey || !signTransaction) return;
    const raw = BigInt(Math.floor(parseFloat(stakeAmount) * 1e9));
    if (raw <= 0n) return;
    setLoading(true);
    setMsg('');
    try {
      const tx = await buildStakeTransaction(connection, publicKey, raw);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      const res = await fetch('/api/stake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txSignature: sig, wallet: publicKey.toBase58() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg('Staked successfully.');
      setStakeAmount('');
      await Promise.all([refreshPool(), refreshStake()]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Stake failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnstakeRequest() {
    if (!publicKey || !signMessage) return;
    setLoading(true);
    setMsg('');
    try {
      const message = `smelt-unstake-request:${publicKey.toBase58()}:${Date.now()}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const bs58 = (await import('bs58')).default;
      const res = await fetch('/api/unstake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', wallet: publicKey.toBase58(), signature: bs58.encode(sigBytes), message }),
      });
      const data = await res.json() as { unlockAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Cooldown started. Unlocks on ${fmtDateShort(data.unlockAt!)}`);
      await refreshStake();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnstakeExecute() {
    if (!publicKey || !signMessage) return;
    setLoading(true);
    setMsg('');
    try {
      const message = `smelt-unstake-execute:${publicKey.toBase58()}:${Date.now()}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const bs58 = (await import('bs58')).default;
      const res = await fetch('/api/unstake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', wallet: publicKey.toBase58(), signature: bs58.encode(sigBytes), message }),
      });
      const data = await res.json() as { smeltReturnedUi?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Unstaked — ${data.smeltReturnedUi?.toFixed(2)} SMELT returned to your wallet.`);
      await Promise.all([refreshPool(), refreshStake()]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 pb-16">

      {/* Header */}
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight pt-6">Stake SMELT</h1>
      <p className="text-gray-400 text-sm mt-1">Lock SMELT to earn SOL rewards every epoch.</p>

      {/* Pool error */}
      {poolError && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm">{poolError}</div>
      )}

      {/* Initial loading spinner */}
      {!poolData && !poolError && (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-green-600 rounded-full animate-spin" />
        </div>
      )}

      {poolData && (
        <>
          {/* Stat strip */}
          <div className="grid grid-cols-3 border border-gray-100 bg-white rounded-2xl overflow-hidden shadow-sm mt-5">
            <StatCell label="Pool SMELT" value={fmtSmelt(poolData.totalSmeltStakedUi)} sub="total staked" />
            <StatCell label="Vault SOL" value={poolData.distributableSol.toFixed(3)} sub="pending dist." green />
            <StatCell label="Stakers" value={String(poolData.stakerCount)} sub="active" />
          </div>

          {/* Epoch card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold text-gray-900">Epoch progress</span>
              <span className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Active
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-1000"
                style={{ width: `${epochProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
              <span>{fmtDate(poolData.epochStart)}</span>
              <span className="font-bold text-gray-600">{epochProgress.toFixed(0)}%</span>
              <span>{fmtDate(poolData.nextDistributionAt)}</span>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              Next distribution in{' '}
              <span className="font-bold text-green-600">{fmtCountdown(msRemaining)}</span>
              {' · '}~<span className="font-bold text-gray-900">{poolData.distributableSol.toFixed(4)} SOL</span> to distribute
            </div>
          </div>

          {/* Disconnected prompt */}
          {!publicKey ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-gray-500 text-sm">Connect your wallet to see your position</p>
              <WalletMultiButton />
            </div>
          ) : (
            <>
              {/* Your position */}
              {stakeData && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">Your position</div>
                  <Row label="Wallet SMELT"><span className="text-gray-900">{fmtSmeltFull(walletSmelt)}</span></Row>
                  <Row label="Staked SMELT"><span className="text-green-600">{fmtSmeltFull(staked)}</span></Row>
                  <Row label="Pool share"><span className="text-green-600">{sharePct.toFixed(3)}%</span></Row>
                  <Row label="Staked since">
                    <span className="text-gray-900">{stakeData.depositedAt ? fmtDateShort(stakeData.depositedAt) : '—'}</span>
                  </Row>
                  <Row label="Status">
                    {staked > 0
                      ? <StatusPill stakeData={stakeData} poolData={poolData} now={now} />
                      : <span className="text-gray-400 text-sm">Not staked</span>
                    }
                  </Row>
                </div>
              )}

              {/* Estimated next reward */}
              {showEstimate && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Estimated next reward</div>
                  <div className="text-center py-2">
                    <div className="text-4xl font-extrabold tracking-tight text-gray-900">
                      <span className="text-green-500">+</span>
                      {estimatedReward.toFixed(4)}
                      <span className="text-lg font-bold text-gray-400 ml-1">SOL</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {sharePct.toFixed(3)}% of {poolData.distributableSol.toFixed(4)} SOL vault
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 mt-3 text-xs text-green-800 leading-relaxed">
                    Estimate only — final amount depends on vault balance and eligible stakers at distribution time.
                  </div>
                </div>
              )}

              {/* Stake form */}
              {!stakeData?.cooldownStartedAt && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Add stake</div>
                  <div className="text-xs text-gray-400 mb-2">Amount (SMELT)</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                    <button
                      onClick={() => setStakeAmount(walletSmelt.toFixed(2))}
                      className="px-3 py-2 text-xs font-bold text-green-700 bg-green-50 rounded-xl hover:bg-green-100"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleStake}
                    disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                    className="w-full mt-3 py-3.5 rounded-full bg-green-600 hover:bg-green-500 active:scale-[0.98] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-green-200 transition-all"
                  >
                    {loading ? 'Processing…' : 'Stake SMELT'}
                  </button>
                </div>
              )}

              {/* Unstake buttons */}
              {stakeData && staked > 0 && (
                <div className="mt-3 space-y-2">
                  {!stakeData.cooldownStartedAt && (
                    <button
                      onClick={handleUnstakeRequest}
                      disabled={loading}
                      className="w-full py-3.5 rounded-full border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 disabled:opacity-40 transition-all"
                    >
                      Start {COOLDOWN_DAYS}-day cooldown to unstake
                    </button>
                  )}
                  {stakeData.cooldownStartedAt && cooldownComplete && (
                    <button
                      onClick={handleUnstakeExecute}
                      disabled={loading}
                      className="w-full py-3.5 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-bold text-sm disabled:opacity-40 shadow-lg shadow-amber-200 transition-all"
                    >
                      {loading ? 'Processing…' : 'Claim SMELT back'}
                    </button>
                  )}
                </div>
              )}

              {/* Status message */}
              {msg && (
                <div className="mt-3 text-sm text-center text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{msg}</div>
              )}
            </>
          )}

          {/* Reward history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Reward history</div>
            {poolData.distributions.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No distributions yet.</div>
            ) : (
              poolData.distributions.map((d, i) => {
                const estimated = (sharePct / 100) * d.totalSol;
                return (
                  <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{fmtDateShort(d.date)}</div>
                      <div className="text-[11px] text-gray-400">
                        {d.totalSol.toFixed(4)} SOL · {d.recipientCount} stakers
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">
                        {publicKey ? `+${estimated.toFixed(4)} SOL` : '—'}
                      </div>
                      <div className="text-[11px] text-gray-400">{publicKey ? 'est. earned' : 'connect wallet'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </>
      )}
    </div>
  );
}
