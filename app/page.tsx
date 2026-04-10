'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, TrashAccount } from '@/lib/solana';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error';

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export default function Home() {
  const { publicKey, connected, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      return;
    }
    scan();
  }, [connected, publicKey]);

  async function scan() {
    setStatus('scanning');
    try {
      const result = await getTrashAccounts(publicKey!);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setStatus('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        {connected && publicKey && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">WALLET</div>
            <div className="text-emerald-50 text-xs font-mono truncate">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </div>
          </div>
        )}

        {status === 'results' && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">SOL TO RECLAIM</div>
            <div className="text-emerald-50 text-2xl font-bold">{sol.toFixed(3)}</div>
            <div className="text-emerald-400/50 text-xs">{accounts.length} accounts</div>
          </div>
        )}

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">Scanning accounts…</div>
            <div className="text-emerald-400/50 text-sm">Fetching prices from Jupiter</div>
          </div>
        )}

        {status === 'results' && (
          <div className="flex flex-col h-full">
            <div className="text-emerald-400 text-xs font-semibold tracking-widest mb-3">
              TRASH ACCOUNTS
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {accounts.map((account, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-950/20 px-4 py-3"
                >
                  <div>
                    <div className="text-emerald-50 text-sm font-semibold">
                      {account.mint.toBase58().slice(0, 4)}…{account.mint.toBase58().slice(-4)}
                    </div>
                    <div className="text-emerald-400/50 text-xs">
                      {account.balance.toLocaleString()} tokens
                    </div>
                  </div>
                  <div className="text-red-300 text-base font-bold">
                    ${account.usdValue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <button
                onClick={() => alert('Coming soon — recycling in Step 2')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ♻ RECYCLE ALL · +{sol.toFixed(3)} SOL
              </button>
            </div>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">✅</div>
            <div className="text-emerald-300 font-semibold">Nothing to recycle</div>
            <div className="text-emerald-400/50 text-sm">Your wallet is clean.</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 max-w-md text-center">
              <div className="text-red-300 font-semibold mb-1">Scan failed</div>
              <div className="text-red-300/70 text-sm">{error}</div>
            </div>
            <button
              onClick={scan}
              className="border border-emerald-700/40 text-emerald-400 text-sm rounded-lg px-4 py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
