'use client';

import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import type { Adapter } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

const MAINNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';

const CP = ConnectionProvider as ComponentType<{ endpoint: string; children: React.ReactNode }>;
const WP = WalletProvider as ComponentType<{ wallets: Adapter[]; autoConnect: boolean; children: React.ReactNode }>;
const WMP = WalletModalProvider as ComponentType<{ children: React.ReactNode }>;

export function Providers({ children }: { children: React.ReactNode }) {
  const appUri = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000';
  const wallets = useMemo(() => [
    new SolanaMobileWalletAdapter({
      appIdentity: { name: 'SMELT Recycler', uri: appUri, icon: `${appUri}/favicon.ico` },
      addressSelector: createDefaultAddressSelector(),
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      cluster: WalletAdapterNetwork.Mainnet,
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    }),
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
