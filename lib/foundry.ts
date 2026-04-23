// lib/foundry.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const FOUNDRY_PATH = path.join(DATA_DIR, 'foundry.json');
export const TOTAL_PLOTS = 500;
export const SMELT_CLAIM_COST = 5_000;
export const FORGE_MULTIPLIER = 1.25;
export const MIN_ACCOUNTS_TO_CLAIM = 10;

export interface ForgeEntry {
  id: number;
  owner: string;
  claimedAt: string;
  smeltBurned: number;
  inscription: string;
}

interface FoundryData {
  plots: ForgeEntry[];
}

function load(): FoundryData {
  try {
    if (!fs.existsSync(FOUNDRY_PATH)) return { plots: [] };
    return JSON.parse(fs.readFileSync(FOUNDRY_PATH, 'utf-8')) as FoundryData;
  } catch {
    return { plots: [] };
  }
}

function save(data: FoundryData): void {
  try {
    fs.writeFileSync(FOUNDRY_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[foundry] Failed to save foundry.json:', err);
  }
}

export function getPlots(): ForgeEntry[] {
  return load().plots;
}

export function getPlotByOwner(wallet: string): ForgeEntry | null {
  return load().plots.find(p => p.owner === wallet) ?? null;
}

export function ownsForge(wallet: string): boolean {
  return load().plots.some(p => p.owner === wallet);
}

export function getNextPlotId(): number | null {
  const data = load();
  if (data.plots.length >= TOTAL_PLOTS) return null;
  const usedIds = new Set(data.plots.map(p => p.id));
  for (let i = 1; i <= TOTAL_PLOTS; i++) {
    if (!usedIds.has(i)) return i;
  }
  return null;
}

export function buildInscription(
  plotId: number,
  wallet: string,
  accounts: number,
  smeltEarned: number,
): string {
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const since = `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `Forge #${plotId} · ${short} · ${accounts} accounts smelted · ${smeltEarned.toLocaleString('en-US')} SMELT extracted · Active since ${since}`;
}

export function recordPlot(entry: ForgeEntry): void {
  const data = load();
  if (data.plots.some(p => p.owner === entry.owner)) {
    console.warn(`[foundry] recordPlot: wallet ${entry.owner} already owns a forge — skipping`);
    return;
  }
  data.plots.push(entry);
  save(data);
}
