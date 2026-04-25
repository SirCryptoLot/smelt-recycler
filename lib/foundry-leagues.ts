// lib/foundry-leagues.ts
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './paths';
import { getWalletStats } from './leaderboard';
import { getForgeBuildings } from './foundry-buildings';
import { getForgeAttacks } from './foundry-combat';
import { getForgeItems, warHornActive } from './foundry-items';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeagueTier = 'bronze' | 'silver' | 'gold';

export interface ForgeLeagueEntry {
  forgeId: number;
  wallet: string;
  league: LeagueTier;
  consecutiveActiveSeasons: number; // seasons with score > 0
  shieldActive: boolean;            // Iron Shield — blocks one relegation
}

export interface SeasonRankRow {
  forgeId: number;
  wallet: string;
  score: number;
  rank: number;
  promoted?: boolean;
  relegated?: boolean;
}

export interface SeasonResult {
  season: number;
  seasonStart: string;
  seasonEnd: string;
  bronze: SeasonRankRow[];
  silver: SeasonRankRow[];
  gold:   SeasonRankRow[];
}

export interface LeagueData {
  season: number;
  seasonStart: string; // ISO — current season start (Monday 00:00 UTC)
  entries: Record<string, ForgeLeagueEntry>; // key = forgeId string
  history: SeasonResult[];
}

// ── Prize pool ────────────────────────────────────────────────────────────────

const POOL_FILE = path.join(DATA_DIR, 'foundry-prize-pool.json');

export interface PrizePool {
  ingotBalance: number;
}

export function loadPrizePool(): PrizePool {
  try {
    if (!fs.existsSync(POOL_FILE)) return { ingotBalance: 0 };
    return JSON.parse(fs.readFileSync(POOL_FILE, 'utf-8')) as PrizePool;
  } catch {
    return { ingotBalance: 0 };
  }
}

export function savePrizePool(pool: PrizePool): void {
  fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
}

// ── League data persistence ───────────────────────────────────────────────────

const FILE = path.join(DATA_DIR, 'foundry-leagues.json');

// Monday 00:00 UTC of the current week
function currentSeasonStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon ...
  const daysSinceMon = (day === 0 ? 6 : day - 1);
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMon));
  return mon.toISOString();
}

function emptyLeagueData(): LeagueData {
  return {
    season: 1,
    seasonStart: currentSeasonStart(),
    entries: {},
    history: [],
  };
}

export function loadLeagueData(): LeagueData {
  try {
    if (!fs.existsSync(FILE)) return emptyLeagueData();
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as LeagueData;
  } catch {
    return emptyLeagueData();
  }
}

export function saveLeagueData(data: LeagueData): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Get or create a forge's league entry (defaults to Bronze)
export function getOrCreateLeagueEntry(forgeId: number, wallet: string): ForgeLeagueEntry {
  const data = loadLeagueData();
  const key = String(forgeId);
  if (!data.entries[key]) {
    data.entries[key] = {
      forgeId,
      wallet,
      league: 'bronze',
      consecutiveActiveSeasons: 0,
      shieldActive: false,
    };
    saveLeagueData(data);
  }
  return data.entries[key];
}

// ── War score computation ─────────────────────────────────────────────────────

/** Count wins for this forge where resolvedAt >= seasonStart */
function raidWinsThisSeason(forgeId: number, seasonStart: string): number {
  const seasonStartMs = new Date(seasonStart).getTime();
  return getForgeAttacks(forgeId).filter(
    a =>
      a.attackerForgeId === forgeId &&
      a.outcome === 'attacker_wins' &&
      a.resolvedAt !== null &&
      new Date(a.resolvedAt).getTime() >= seasonStartMs,
  ).length;
}

export function computeWarScore(forgeId: number, wallet: string, seasonStart: string): number {
  const weekly = getWalletStats(wallet).weekly;
  const accountsBase = Math.min(weekly.accounts * 10, 600);
  const solBase      = weekly.solReclaimed * 500;
  const raidBase     = raidWinsThisSeason(forgeId, seasonStart) * 50;
  const base         = accountsBase + solBase + raidBase;

  if (base === 0) return 0;

  const buildings    = getForgeBuildings(forgeId);
  const warHallLevel = buildings.levels['war_hall'];
  const warHallMult  = Math.pow(1.10, warHallLevel);

  const entry        = getOrCreateLeagueEntry(forgeId, wallet);
  const streakMult   = Math.min(1.0 + entry.consecutiveActiveSeasons * 0.05, 1.50);

  const items        = getForgeItems(forgeId);
  const rodMult      = 1 + Math.min(3, items.lightningRods) * 0.15;
  const hornMult     = warHornActive(items) ? 2 : 1;

  return Math.floor(base * warHallMult * streakMult * rodMult * hornMult);
}

// ── Prize amounts by league (top 3 positions) ─────────────────────────────────

export const PRIZE_SMELT: Record<LeagueTier, [number, number, number]> = {
  bronze: [8_000,  4_000,  3_000],
  silver: [18_000, 10_000, 7_000],
  gold:   [40_000, 24_000, 16_000],
};
