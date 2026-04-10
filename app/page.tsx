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
    }
  }, [connected, publicKey]);

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
      </main>
    </div>
  );
}
