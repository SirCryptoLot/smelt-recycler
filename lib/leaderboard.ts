// lib/leaderboard.ts
import * as fs from 'fs';
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/leaderboard.json');

export interface LeaderboardEntry {
  accounts: number;
  solReclaimed: number;
  smeltEarned: number;
}

export interface LeaderboardData {
  weekly: { since: string; entries: Record<string, LeaderboardEntry> };
  allTime: { entries: Record<string, LeaderboardEntry> };
}

function load(): LeaderboardData {
  try {
    if (!fs.existsSync(PATH)) return {
      weekly: { since: new Date().toISOString(), entries: {} },
      allTime: { entries: {} },
    };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as LeaderboardData;
  } catch {
    return { weekly: { since: new Date().toISOString(), entries: {} }, allTime: { entries: {} } };
  }
}

function save(data: LeaderboardData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

export function recordRecycle(wallet: string, accounts: number, solReclaimed: number, smeltEarned: number): void {
  const data = load();

  const w = data.weekly.entries[wallet] ?? { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  data.weekly.entries[wallet] = {
    accounts: w.accounts + accounts,
    solReclaimed: w.solReclaimed + solReclaimed,
    smeltEarned: w.smeltEarned + smeltEarned,
  };

  const a = data.allTime.entries[wallet] ?? { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  data.allTime.entries[wallet] = {
    accounts: a.accounts + accounts,
    solReclaimed: a.solReclaimed + solReclaimed,
    smeltEarned: a.smeltEarned + smeltEarned,
  };

  save(data);
}

export function getLeaderboard(): LeaderboardData {
  return load();
}

export function getWalletStats(wallet: string): { weekly: LeaderboardEntry; allTime: LeaderboardEntry } {
  const data = load();
  const empty = { accounts: 0, solReclaimed: 0, smeltEarned: 0 };
  return {
    weekly: data.weekly.entries[wallet] ?? empty,
    allTime: data.allTime.entries[wallet] ?? empty,
  };
}

export function getWeeklyRank(wallet: string): number {
  const data = load();
  const sorted = Object.entries(data.weekly.entries)
    .sort(([, a], [, b]) => b.accounts - a.accounts);
  const idx = sorted.findIndex(([w]) => w === wallet);
  return idx === -1 ? 0 : idx + 1;
}
