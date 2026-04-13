'use client';

import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { Adapter } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

const MAINNET_RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';

const CP = ConnectionProvider as ComponentType<{ endpoint: string; children: React.ReactNode }>;
const WP = WalletProvider as ComponentType<{ wallets: Adapter[]; autoConnect: boolean; children: React.ReactNode }>;
const WMP = WalletModalProvider as ComponentType<{ children: React.ReactNode }>;

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);
  return (
    <CP endpoint={MAINNET_RPC}>
      <WP wallets={wallets} autoConnect>
        <WMP>{children}</WMP>
      </WP>
    </CP>
  );
}
