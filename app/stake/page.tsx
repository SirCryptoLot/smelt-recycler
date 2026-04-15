// app/stake/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { fetchSmeltBalance, fetchStakeInfo, buildStakeTransaction, StakeInfo } from '@/lib/smelt';
import { COOLDOWN_DAYS } from '@/lib/constants';

function fmt(raw: bigint): string {
  return (Number(raw) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function StakePage() {
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

  const [smeltBalance, setSmeltBalance] = useState(0n);
  const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    const [bal, info] = await Promise.all([
      fetchSmeltBalance(connection, publicKey),
      fetchStakeInfo(publicKey),
    ]);
    setSmeltBalance(bal);
    setStakeInfo(info);
  }, [publicKey, connection]);

  useEffect(() => { refresh(); }, [refresh]);

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
      const data = await res.json() as { success?: boolean; error?: string; smeltStakedUi?: number; sharePct?: number };
      if (!res.ok) throw new Error(data.error ?? 'Failed to record stake');

      setMsg(`Staked! You now hold ${data.smeltStakedUi?.toFixed(2)} SMELT (${data.sharePct?.toFixed(2)}% of pool)`);
      setStakeAmount('');
      await refresh();
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
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = await signMessage(msgBytes);
      const bs58 = (await import('bs58')).default;
      const signature = bs58.encode(sigBytes);

      const res = await fetch('/api/unstake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', wallet: publicKey.toBase58(), signature, message }),
      });
      const data = await res.json() as { success?: boolean; error?: string; unlockAt?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Cooldown started. SMELT unlocks on ${new Date(data.unlockAt!).toLocaleDateString()}`);
      await refresh();
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
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = await signMessage(msgBytes);
      const bs58 = (await import('bs58')).default;
      const signature = bs58.encode(sigBytes);

      const res = await fetch('/api/unstake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', wallet: publicKey.toBase58(), signature, message }),
      });
      const data = await res.json() as { success?: boolean; error?: string; smeltReturnedUi?: number; txSignature?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMsg(`Unstaked ${data.smeltReturnedUi?.toFixed(2)} SMELT returned to your wallet. Tx: ${data.txSignature?.slice(0, 16)}...`);
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setLoading(false);
    }
  }

  const cooldownComplete = stakeInfo?.cooldownStartedAt
    ? Date.now() - new Date(stakeInfo.cooldownStartedAt).getTime() >= COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900">Stake SMELT</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Stake SMELT to earn a share of SOL rewards distributed every 2 days.
          Must be staked for a full epoch to earn. {COOLDOWN_DAYS}-day cooldown to unstake.
        </p>
      </div>

      {!publicKey ? (
        <div className="flex flex-col items-center gap-4 py-10">
          <p className="text-gray-500">Connect your wallet to stake</p>
          <WalletMultiButton />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Balances */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-1">Wallet SMELT</div>
              <div className="text-2xl font-bold text-gray-900">{fmt(smeltBalance)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-1">Staked SMELT</div>
              <div className="text-2xl font-bold text-green-600">
                {stakeInfo ? fmt(stakeInfo.smeltStaked) : '0'}
              </div>
            </div>
          </div>

          {/* Pool share */}
          {stakeInfo && stakeInfo.smeltStaked > 0n && (
            <div className="bg-green-50 rounded-2xl p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Your pool share</span>
                <span className="font-semibold text-green-700">{stakeInfo.sharePct.toFixed(3)}%</span>
              </div>
              {stakeInfo.cooldownStartedAt ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cooldown status</span>
                  <span className="font-semibold text-amber-600">
                    {cooldownComplete ? 'Ready to claim' : `Unlocks ${new Date(new Date(stakeInfo.cooldownStartedAt).getTime() + COOLDOWN_DAYS * 86400000).toLocaleDateString()}`}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="font-semibold text-green-700">Earning rewards</span>
                </div>
              )}
            </div>
          )}

          {/* Stake form */}
          {!stakeInfo?.cooldownStartedAt && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Amount to stake (SMELT)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <button
                  onClick={() => setStakeAmount((Number(smeltBalance) / 1e9).toString())}
                  className="px-3 py-2 text-xs font-medium text-green-700 bg-green-50 rounded-xl hover:bg-green-100"
                >
                  Max
                </button>
              </div>
              <button
                onClick={handleStake}
                disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                className="w-full py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing…' : 'Stake SMELT'}
              </button>
            </div>
          )}

          {/* Unstake buttons */}
          {stakeInfo && stakeInfo.smeltStaked > 0n && (
            <div className="space-y-2">
              {!stakeInfo.cooldownStartedAt && (
                <button
                  onClick={handleUnstakeRequest}
                  disabled={loading}
                  className="w-full py-3 rounded-full border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Start {COOLDOWN_DAYS}-day cooldown to unstake
                </button>
              )}
              {stakeInfo.cooldownStartedAt && cooldownComplete && (
                <button
                  onClick={handleUnstakeExecute}
                  disabled={loading}
                  className="w-full py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-50"
                >
                  {loading ? 'Processing…' : 'Claim SMELT back'}
                </button>
              )}
            </div>
          )}

          {/* Status message */}
          {msg && (
            <div className="text-sm text-center text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
              {msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
