'use client';

// MobileWalletConnect.tsx
// On desktop or inside a wallet's in-app browser → render children (WalletMultiButton).
// On a plain mobile browser where no wallet is injected → show deep-link buttons
// that open this page inside Phantom / Solflare's browser.

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

type WalletEnv = 'desktop' | 'in-wallet' | 'mobile-plain';

function detectEnv(): WalletEnv {
  if (typeof window === 'undefined') return 'desktop';

  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return 'desktop';

  const w = window as Record<string, unknown>;
  const isPhantom   = !!(w['phantom'] as { solana?: { isPhantom?: boolean } } | undefined)?.solana?.isPhantom;
  const isSolflare  = !!(w['solflare'] as { isSolflare?: boolean } | undefined)?.isSolflare;
  const isBackpack  = typeof w['xnft'] !== 'undefined';

  if (isPhantom || isSolflare || isBackpack) return 'in-wallet';
  return 'mobile-plain';
}

export function MobileWalletConnect({ className }: { className?: string }) {
  const [env, setEnv] = useState<WalletEnv>('desktop');

  useEffect(() => {
    setEnv(detectEnv());
  }, []);

  // Desktop or already inside a wallet browser — use the normal button
  if (env !== 'mobile-plain') {
    return (
      <WalletMultiButton
        className={className ?? '!w-full !justify-center !text-base !font-bold !rounded-full !py-4 !h-auto !text-white !bg-green-600'}
      />
    );
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const encoded    = encodeURIComponent(currentUrl);

  const wallets = [
    {
      name: 'Phantom',
      icon: '/wallet-icons/phantom.png',
      fallbackIcon: '👻',
      color: 'bg-purple-600 hover:bg-purple-700',
      url: `https://phantom.app/ul/browse/${encoded}?ref=${encoded}`,
    },
    {
      name: 'Solflare',
      icon: '/wallet-icons/solflare.png',
      fallbackIcon: '☀️',
      color: 'bg-orange-500 hover:bg-orange-600',
      url: `https://solflare.com/ul/browse/${encoded}`,
    },
    {
      name: 'Backpack',
      icon: '/wallet-icons/backpack.png',
      fallbackIcon: '🎒',
      color: 'bg-gray-800 hover:bg-gray-900',
      url: `https://backpack.app/ul/browse/${encoded}`,
    },
  ];

  return (
    <div className="w-full max-w-xs space-y-2.5">
      <p className="text-xs text-gray-400 text-center mb-1">Open this page in your wallet app</p>
      {wallets.map(({ name, fallbackIcon, color, url }) => (
        <a
          key={name}
          href={url}
          className={`flex items-center justify-center gap-2.5 w-full ${color} text-white font-bold rounded-full py-3.5 text-base transition-colors`}
        >
          <span className="text-xl leading-none">{fallbackIcon}</span>
          Open in {name}
        </a>
      ))}
      <p className="text-[11px] text-gray-300 text-center pt-1">
        This opens the app&apos;s built-in browser where your wallet is active
      </p>
    </div>
  );
}
