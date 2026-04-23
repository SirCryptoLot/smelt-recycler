// app/stake/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { fetchSmeltBalance, buildStakeTransaction } from '@/lib/smelt';
import { COOLDOWN_DAYS } from '@/lib/constants';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { PageHeading } from '@/components/PageHeading';

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

function usdStr(smelt: number, price: number | null): string | null {
  if (!price || smelt <= 0) return null;
  const v = smelt * price;
  return `≈ $${v < 0.01 ? v.toFixed(6) : v.toFixed(2)}`;
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

function StatusMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  const isError = /fail|error|invalid|not found|does not match|no smelt/i.test(msg);
  return (
    <div className={`mt-3 text-sm text-center rounded-xl px-4 py-3 ${
      isError
        ? 'text-red-700 bg-red-50 border border-red-100'
        : 'text-green-700 bg-green-50 border border-green-100'
    }`}>
      {msg}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StakePage() {
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

  const [poolData, setPoolData]     = useState<PoolData | null>(null);
  const [stakeData, setStakeData]   = useState<StakeData | null>(null);
  const [walletSmelt, setWalletSmelt] = useState(0);
  const [smeltPrice, setSmeltPrice] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [loading, setLoading]       = useState(false);
  const [forgePlotId, setForgePlotId] = useState<number | null>(null);
  const [msg, setMsg]               = useState('');
  const [poolError, setPoolError]   = useState('');
  const [now, setNow]               = useState(Date.now());
  const [topStakers, setTopStakers] = useState<Array<{ wallet: string; stakedUi: number; sharePct: number }>>([]);
  const [showAllDist, setShowAllDist] = useState(false);

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
      const wallet = publicKey.toBase58();
      const [bal, res, foundryRes] = await Promise.all([
        fetchSmeltBalance(connection, publicKey),
        fetch(`/api/stake?wallet=${wallet}`),
        fetch('/api/foundry', { cache: 'no-store' }),
      ]);
      setWalletSmelt(Number(bal) / 1e9);
      if (res.ok) setStakeData(await res.json() as StakeData);
      if (foundryRes.ok) {
        const fd = await foundryRes.json() as { plots: Array<{ owner: string | null; id: number }> };
        const myPlot = fd.plots.find(p => p.owner === wallet);
        setForgePlotId(myPlot?.id ?? null);
      }
    } catch { /* non-fatal */ }
  }, [publicKey, connection]);

  useEffect(() => {
    void refreshPool();
    const id = setInterval(() => { void refreshPool(); }, 30_000);
    return () => clearInterval(id);
  }, [refreshPool]);

  useEffect(() => {
    fetch('/api/stakers', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(setTopStakers)
      .catch(() => {});
    fetch('/api/smelt-price', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { price: number | null } | null) => { if (d?.price) setSmeltPrice(d.price); })
      .catch(() => {});
  }, []);

  useEffect(() => { void refreshStake(); }, [refreshStake]);

  useEffect(() => {
    if (!publicKey) {
      setStakeData(null);
      setWalletSmelt(0);
      setMsg('');
    }
  }, [publicKey]);

  // Derived values
  const epochDurationMs = 48 * 60 * 60 * 1000;
  const epochStartMs    = poolData ? new Date(poolData.epochStart).getTime() : 0;
  const nextDistMs      = poolData ? new Date(poolData.nextDistributionAt).getTime() : 0;
  const epochProgress   = poolData
    ? Math.min(100, Math.max(0, ((now - epochStartMs) / epochDurationMs) * 100))
    : 0;
  const msRemaining = Math.max(0, nextDistMs - now);

  const staked      = stakeData?.stakedUi ?? 0;
  const sharePct    = stakeData?.sharePct ?? 0;
  const estimatedReward = (sharePct / 100) * (poolData?.distributableSol ?? 0);
  const showEstimate    = staked > 0 && !stakeData?.cooldownStartedAt;

  const cooldownMs       = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const cooldownComplete = stakeData?.cooldownStartedAt
    ? now - new Date(stakeData.cooldownStartedAt).getTime() >= cooldownMs
    : false;

  // APR estimate from last distribution
  const aprEstimate: number | null = (() => {
    if (!poolData || poolData.distributions.length === 0 || poolData.totalSmeltStakedUi <= 0) return null;
    const last = poolData.distributions[0];
    // SOL per SMELT per epoch, annualized (365 / 2 = 182.5 epochs/year for 48h epochs)
    const solPerSmeltPerEpoch = last.totalSol / poolData.totalSmeltStakedUi;
    return solPerSmeltPerEpoch * 182.5 * 100; // as percentage
  })();

  // Input validation
  const stakeAmountNum = parseFloat(stakeAmount) || 0;
  const stakeExceedsBalance = stakeAmountNum > walletSmelt && walletSmelt > 0;
  const stakeDisabled = loading || !stakeAmount || stakeAmountNum <= 0 || stakeExceedsBalance;

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
    <PageShell>
      <PageHeading
        title="Stake SMELT"
        subtitle="Lock SMELT to earn SOL rewards every epoch."
      />

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
            <StatCell label="Vault SOL"  value={poolData.distributableSol.toFixed(3)}  sub="pending dist." green />
            <StatCell label="Stakers"    value={String(poolData.stakerCount)}           sub="active" />
          </div>

          {/* APR estimate */}
          {aprEstimate !== null && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <span>Est. APR</span>
              <span className="font-bold text-green-600">{aprEstimate.toFixed(1)}%</span>
              <span className="text-gray-300">· based on last distribution</span>
            </div>
          )}

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
              <span className="font-bold text-green-600 inline-block tabular-nums" style={{ minWidth: '9ch' }}>{fmtCountdown(msRemaining)}</span>
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
                  <Row label="Wallet SMELT">
                    <div className="text-right">
                      <div>{fmtSmeltFull(walletSmelt)}</div>
                      {usdStr(walletSmelt, smeltPrice) && (
                        <div className="text-[11px] text-gray-400 font-normal">{usdStr(walletSmelt, smeltPrice)}</div>
                      )}
                    </div>
                  </Row>
                  <Row label="Staked SMELT">
                    <div className="text-right">
                      <div className="text-green-600">{fmtSmeltFull(staked)}</div>
                      {usdStr(staked, smeltPrice) && (
                        <div className="text-[11px] text-gray-400 font-normal">{usdStr(staked, smeltPrice)}</div>
                      )}
                    </div>
                  </Row>
                  <Row label="Pool share"><span className="text-green-600">{sharePct.toFixed(3)}%</span></Row>
                  <Row label="Staked since">
                    <span>{stakeData.depositedAt ? fmtDateShort(stakeData.depositedAt) : '—'}</span>
                  </Row>
                  <Row label="Status">
                    {staked > 0
                      ? <StatusPill stakeData={stakeData} poolData={poolData} now={now} />
                      : <span className="text-gray-400 text-sm">Not staked</span>
                    }
                  </Row>
                  {forgePlotId !== null && (
                    <Row label="Forge bonus">
                      <span className="text-amber-600 font-semibold text-sm">⚒ Forge #{forgePlotId} · 1.25× SOL share</span>
                    </Row>
                  )}
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

              {/* Stake form OR get SMELT CTA */}
              {!stakeData?.cooldownStartedAt && (
                walletSmelt === 0 && staked === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3 space-y-3">
                    <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Get SMELT to stake</div>
                    <p className="text-sm text-gray-500">You need SMELT tokens to stake. Earn them for free by recycling dust accounts, or buy on the swap page.</p>
                    <div className="flex gap-2">
                      <Link href="/" className="flex-1 py-3 rounded-full bg-green-600 hover:bg-green-500 text-white font-bold text-sm text-center transition-all">
                        ♻ Recycle &amp; Earn
                      </Link>
                      <Link href="/swap" className="flex-1 py-3 rounded-full border border-gray-200 text-gray-600 font-semibold text-sm text-center hover:bg-gray-50 transition-all">
                        Buy SMELT
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
                    <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Add stake</div>
                    <div className="text-xs text-gray-400 mb-2">
                      Amount (SMELT)
                      {walletSmelt > 0 && (
                        <span className="ml-1 text-gray-300">· {fmtSmeltFull(walletSmelt)} available</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="0"
                        className={`flex-1 border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 transition-colors ${
                          stakeExceedsBalance
                            ? 'border-red-300 focus:ring-red-200 bg-red-50'
                            : 'border-gray-200 focus:ring-green-300'
                        }`}
                      />
                      <button
                        onClick={() => setStakeAmount(walletSmelt.toString())}
                        className="px-3 py-2 text-xs font-bold text-green-700 bg-green-50 rounded-xl hover:bg-green-100"
                      >
                        MAX
                      </button>
                    </div>
                    {stakeExceedsBalance && (
                      <div className="text-xs text-red-500 mt-1.5">Exceeds wallet balance ({fmtSmeltFull(walletSmelt)} SMELT)</div>
                    )}
                    <button
                      onClick={handleStake}
                      disabled={stakeDisabled}
                      className="w-full mt-3 py-3.5 rounded-full bg-green-600 hover:bg-green-500 active:scale-[0.98] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-green-200 transition-all"
                    >
                      {loading ? 'Processing…' : 'Stake SMELT'}
                    </button>
                  </div>
                )
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
              <StatusMsg msg={msg} />
            </>
          )}

          {/* Reward history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Reward history</div>
            {poolData.distributions.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No distributions yet.</div>
            ) : (
              <>
                {(showAllDist ? poolData.distributions : poolData.distributions.slice(0, 3)).map((d, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{fmtDateShort(d.date)}</div>
                      <div className="text-[11px] text-gray-400">
                        {d.totalSol.toFixed(4)} SOL · {d.recipientCount} stakers
                      </div>
                    </div>
                    {publicKey && sharePct > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-bold text-green-600">
                          ~{((sharePct / 100) * d.totalSol).toFixed(4)} SOL
                        </div>
                        <div className="text-[10px] text-gray-300">at current share</div>
                      </div>
                    )}
                  </div>
                ))}
                {poolData.distributions.length > 3 && (
                  <button onClick={() => setShowAllDist(v => !v)} className="w-full text-xs text-gray-400 hover:text-green-600 pt-2.5 text-center transition-colors">
                    {showAllDist ? 'Show less' : `+${poolData.distributions.length - 3} more`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Top stakers */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Top stakers</div>
            {topStakers.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No stakers yet.</div>
            ) : (
              topStakers.map((s, i) => {
                const isYou = publicKey?.toBase58() === s.wallet;
                return (
                  <div key={s.wallet} className={`flex items-center justify-between py-2.5 [&+&]:border-t border-gray-100 ${isYou ? 'bg-green-50 -mx-4 px-4 rounded-xl' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-300 w-4 tabular-nums">{i + 1}</span>
                      <span className={`text-sm font-mono ${isYou ? 'text-green-700 font-bold' : 'text-gray-600'}`}>
                        {`${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}`}
                      </span>
                      {isYou && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">You</span>}
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold tabular-nums ${isYou ? 'text-green-700' : 'text-gray-900'}`}>{fmtSmelt(s.stakedUi)}</div>
                      <div className="text-[11px] text-gray-400">{s.sharePct.toFixed(2)}% share</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </>
      )}
    </PageShell>
  );
}
