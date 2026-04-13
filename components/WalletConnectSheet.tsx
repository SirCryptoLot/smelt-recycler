'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

type DetectedWallet = 'phantom' | 'backpack' | 'solflare' | 'jupiter' | null;

const WALLETS = [
  {
    id: 'phantom' as const,
    name: 'Phantom',
    color: '#7c3aed',
    emoji: '👻',
    deepLink: (url: string) => `https://phantom.app/ul/browse/${url}?ref=${url}`,
  },
  {
    id: 'backpack' as const,
    name: 'Backpack',
    color: '#e879f9',
    emoji: '🎒',
    deepLink: (url: string) => `https://backpack.app/ul/browse/${url}?ref=${url}`,
  },
  {
    id: 'solflare' as const,
    name: 'Solflare',
    color: '#ff6b35',
    emoji: '🔆',
    deepLink: (url: string) => `https://solflare.com/ul/v1/browse/${url}?ref=${url}`,
  },
  {
    id: 'jupiter' as const,
    name: 'Jupiter',
    color: '#38bdf8',
    emoji: '🪐',
    deepLink: (_url: string) => `https://jup.ag`,
  },
];

function detectWallet(): DetectedWallet {
  if (typeof window === 'undefined') return null;
  if ((window as any).phantom?.solana?.isPhantom) return 'phantom';
  if ((window as any).backpack?.isBackpack) return 'backpack';
  if ((window as any).solflare?.isSolflare) return 'solflare';
  if ((window as any).jupiter?.isMobile) return 'jupiter';
  return null;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function encodedHref(): string {
  return encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : 'https://recycler.app'
  );
}

interface WalletConnectSheetProps {
  open: boolean;
  onClose: () => void;
}

export function WalletConnectSheet({ open, onClose }: WalletConnectSheetProps) {
  const { select, wallets } = useWallet();
  const [detected, setDetected] = useState<DetectedWallet>(null);
  const [isExternalMobile, setIsExternalMobile] = useState(false);

  useEffect(() => {
    const d = detectWallet();
    setDetected(d);
    setIsExternalMobile(isMobile() && d === null);
  }, []);

  if (!open) return null;

  const url = encodedHref();
  const detectedWallet = WALLETS.find((w) => w.id === detected);
  const otherWallets = WALLETS.filter((w) => w.id !== detected);

  function handleConnect() {
    if (!detectedWallet) return;
    const adapter = wallets.find(
      (w) => w.adapter.name.toLowerCase() === detectedWallet.name.toLowerCase()
    );
    if (!adapter) return;
    select(adapter.adapter.name);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-5 pb-8 animate-slide-up">
        {/* Drag handle */}
        <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="font-bold text-gray-900 text-base mb-1">Connect Wallet</div>

        {isExternalMobile ? (
          /* State B — external browser: show all 4 as deep links */
          <>
            <p className="text-xs text-gray-500 mb-4">
              Open this page in your wallet app to connect
            </p>
            <div className="flex flex-col gap-2.5">
              {WALLETS.map((w) => (
                <a
                  key={w.id}
                  href={w.deepLink(url)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-white font-semibold text-sm"
                  style={{ backgroundColor: w.color }}
                >
                  <span className="text-lg">{w.emoji}</span>
                  <span className="flex-1">Open in {w.name}</span>
                  <span className="text-xs opacity-80">→</span>
                </a>
              ))}
            </div>
          </>
        ) : detectedWallet ? (
          /* State A — inside a wallet browser: highlight detected, list others */
          <>
            <p className="text-xs text-gray-500 mb-4">
              {detectedWallet.name} detected
            </p>

            {/* Detected wallet — prominent */}
            <button
              onClick={handleConnect}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-3 font-semibold text-sm border-2 text-white"
              style={{ backgroundColor: detectedWallet.color, borderColor: detectedWallet.color }}
            >
              <span className="text-lg">{detectedWallet.emoji}</span>
              <span className="flex-1 text-left">Connect {detectedWallet.name}</span>
              <span className="text-xs opacity-80 font-medium px-2 py-0.5 bg-white/20 rounded-full">Detected</span>
            </button>

            {/* Other wallets — secondary deep links */}
            <p className="text-[11px] text-gray-400 mb-2">Other wallets</p>
            <div className="flex flex-col gap-1.5">
              {otherWallets.map((w) => (
                <a
                  key={w.id}
                  href={w.deepLink(url)}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5 bg-gray-50 border border-gray-100 text-sm text-gray-600"
                >
                  <span className="text-base">{w.emoji}</span>
                  <span className="flex-1 font-medium">{w.name}</span>
                  <span className="text-xs text-gray-400">Open app →</span>
                </a>
              ))}
            </div>
          </>
        ) : (
          /* Desktop fallback (shouldn't normally show, WalletMultiButton used instead) */
          <p className="text-sm text-gray-500">Use the Connect button above.</p>
        )}
      </div>
    </>
  );
}
