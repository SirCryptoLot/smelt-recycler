'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { fetchSmeltBalance } from './smelt';

interface SmeltContextValue {
  smeltBalance: bigint;
  refreshSmelt: () => void;
}

const SmeltContext = createContext<SmeltContextValue>({
  smeltBalance: 0n,
  refreshSmelt: () => {},
});

export function SmeltProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [smeltBalance, setSmeltBalance] = useState(0n);

  const refreshSmelt = useCallback(() => {
    if (!publicKey) return;
    fetchSmeltBalance(connection, publicKey).then(setSmeltBalance).catch(console.error);
  }, [publicKey, connection]);

  useEffect(() => {
    if (!publicKey) { setSmeltBalance(0n); return; }
    refreshSmelt();
  }, [refreshSmelt, publicKey]);

  return (
    <SmeltContext.Provider value={{ smeltBalance, refreshSmelt }}>
      {children}
    </SmeltContext.Provider>
  );
}

export function useSmelt(): SmeltContextValue {
  return useContext(SmeltContext);
}
