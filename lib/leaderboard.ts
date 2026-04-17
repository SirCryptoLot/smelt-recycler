// lib/leaderboard.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'leaderboard.json');

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
  const empty = () => ({ weekly: { since: new Date().toISOString(), entries: {} as Record<string, LeaderboardEntry> }, allTime: { entries: {} as Record<string, LeaderboardEntry> } });
  try {
    if (!fs.existsSync(PATH)) return empty();
    const raw = JSON.parse(fs.readFileSync(PATH, 'utf-8')) as LeaderboardData;
    // Migrate: entries may have been written as [] instead of {}
    if (Array.isArray(raw?.weekly?.entries)) raw.weekly.entries = {};
    if (Array.isArray(raw?.allTime?.entries)) raw.allTime.entries = {};
    return raw;
  } catch {
    return empty();
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

export function resetWeeklyLeaderboard(): void {
  const data = load();
  data.weekly = { since: new Date().toISOString(), entries: {} };
  save(data);
}

export function getWeeklyRank(wallet: string): number {
  const data = load();
  // Sort by accounts closed (primary ranking metric)
  const sorted = Object.entries(data.weekly.entries)
    .sort(([, a], [, b]) => b.accounts - a.accounts);
  const idx = sorted.findIndex(([w]) => w === wallet);
  return idx === -1 ? 0 : idx + 1;
}
