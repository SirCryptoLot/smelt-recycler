// lib/pools.ts

export interface VaultToken {
  mint: string;
  uiAmount: number;
  usdValue: number;
  symbol?: string;
  pctOfThreshold: number;
}

export interface LiquidationEntry {
  date: string;
  mint: string;
  amountIn: number;
  solReceived: number;
  txSignature: string;
  distributed: boolean;
}

export interface DistributionEntry {
  date: string;
  totalSol: number;
  recipientCount: number;
  txSignatures: string[];
}

export interface PoolsData {
  tokens: VaultToken[];
  liquidations: {
    recent: LiquidationEntry[];
    undistributedSol: number;
  };
  fees: {
    undistributedSol: number;
    totalCollected: number;
    totalAccountsClosed: number;
  };
  distributions: {
    totalSolDistributed: number;
    lastDistribution: DistributionEntry | null;
    nextDistributionDate: string | null;
  };
}

export async function fetchPoolsData(): Promise<PoolsData> {
  const [vaultRes, statsRes] = await Promise.all([
    fetch('/api/vault', { cache: 'no-store' }),
    fetch('/api/stats', { cache: 'no-store' }),
  ]);

  const vault = vaultRes.ok
    ? (await vaultRes.json() as { tokens: VaultToken[] })
    : { tokens: [] };

  const stats = statsRes.ok
    ? (await statsRes.json() as Omit<PoolsData, 'tokens'>)
    : {
        liquidations: { recent: [], undistributedSol: 0 },
        fees: { undistributedSol: 0, totalCollected: 0, totalAccountsClosed: 0 },
        distributions: { totalSolDistributed: 0, lastDistribution: null, nextDistributionDate: null },
      };

  return {
    tokens: vault.tokens,
    ...stats,
  };
}

/**
 * Calculate the user's estimated SOL share from the next distribution.
 * smeltBalance and smeltStaked are in raw units (9 decimals).
 * totalWeight is the sum of all holder weights.
 * undistributedSol is the pending SOL amount.
 */
export function estimateUserShare(
  smeltBalance: bigint,
  smeltStaked: bigint,
  totalWeight: number,
  undistributedSol: number,
): number {
  if (totalWeight === 0 || undistributedSol === 0) return 0;
  const unstaked = smeltBalance - smeltStaked;
  const userWeight = Number(unstaked > 0n ? unstaked : 0n) * 1 + Number(smeltStaked) * 1.5;
  return (userWeight / totalWeight) * undistributedSol;
}
