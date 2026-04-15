// lib/staking-pool.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const POOL_PATH = path.join(DATA_DIR, 'staking-pool.json');

export interface StakeRecord {
  smeltStaked: string;        // raw bigint as string (9 decimals)
  depositedAt: string;        // ISO — when stake was recorded
  cooldownStartedAt: string | null; // ISO — when unstake was requested, null if active
}

export interface PoolState {
  totalSmeltStaked: string;   // raw bigint as string
  epochStart: string;         // ISO — updated by cron at each distribution
  stakes: Record<string, StakeRecord>; // wallet pubkey → record
}

function empty(): PoolState {
  return {
    totalSmeltStaked: '0',
    epochStart: new Date().toISOString(),
    stakes: {},
  };
}

export function loadPool(): PoolState {
  try {
    if (!fs.existsSync(POOL_PATH)) return empty();
    return JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8')) as PoolState;
  } catch {
    return empty();
  }
}

export function savePool(state: PoolState): void {
  fs.writeFileSync(POOL_PATH, JSON.stringify(state, null, 2));
}

/** Add or top-up a stake. Returns the updated record. */
export function addStake(wallet: string, smeltRaw: bigint): StakeRecord {
  const state = loadPool();
  const existing = state.stakes[wallet];

  const newTotal = BigInt(existing?.smeltStaked ?? '0') + smeltRaw;
  const record: StakeRecord = {
    smeltStaked: newTotal.toString(),
    // If topping up, keep original depositedAt so epoch eligibility isn't reset
    depositedAt: existing?.depositedAt ?? new Date().toISOString(),
    cooldownStartedAt: null, // cancel any pending cooldown if topping up
  };

  state.stakes[wallet] = record;
  state.totalSmeltStaked = (BigInt(state.totalSmeltStaked) + smeltRaw).toString();
  savePool(state);
  return record;
}

/** Start the unstake cooldown. Returns false if wallet has no stake. */
export function requestUnstake(wallet: string): boolean {
  const state = loadPool();
  const record = state.stakes[wallet];
  if (!record || BigInt(record.smeltStaked) === 0n) return false;
  record.cooldownStartedAt = new Date().toISOString();
  savePool(state);
  return true;
}

/** Execute unstake — removes record. Returns smeltRaw to return, or 0n if not ready. */
export function executeUnstake(wallet: string, cooldownDays: number): bigint {
  const state = loadPool();
  const record = state.stakes[wallet];
  if (!record || !record.cooldownStartedAt) return 0n;

  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(record.cooldownStartedAt).getTime();
  if (elapsed < cooldownMs) return 0n;

  const smeltRaw = BigInt(record.smeltStaked);
  state.totalSmeltStaked = (BigInt(state.totalSmeltStaked) - smeltRaw).toString();
  delete state.stakes[wallet];
  savePool(state);
  return smeltRaw;
}

/** Get wallets eligible for current epoch rewards (staked before epochStart, not in cooldown). */
export function getEpochEligibleStakes(state: PoolState): Array<{ wallet: string; smeltRaw: bigint }> {
  const epochStart = new Date(state.epochStart).getTime();
  return Object.entries(state.stakes)
    .filter(([, r]) => !r.cooldownStartedAt && new Date(r.depositedAt).getTime() < epochStart)
    .map(([wallet, r]) => ({ wallet, smeltRaw: BigInt(r.smeltStaked) }));
}
