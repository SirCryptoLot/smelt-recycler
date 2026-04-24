// lib/foundry-buildings.ts
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './paths';

// ── Types ────────────────────────────────────────────────────────────────────

export type BuildingType =
  | 'blast_furnace' | 'barracks' | 'rampart' | 'rally_point'
  | 'vault_storage' | 'smithy' | 'war_hall' | 'embassy';

export const ALL_BUILDINGS: BuildingType[] = [
  'blast_furnace', 'barracks', 'rampart', 'rally_point',
  'vault_storage', 'smithy', 'war_hall', 'embassy',
];

export const BUILDING_META: Record<BuildingType, {
  label: string;
  icon: string;
  baseCost: number;
  effectLabel: string;
}> = {
  blast_furnace: { label: 'Blast Furnace', icon: '🔥', baseCost: 2_000, effectLabel: '+20% SMELT production / level' },
  barracks:      { label: 'Barracks',      icon: '⚔️', baseCost: 2_500, effectLabel: '−10% train time, +5 troop cap / level' },
  rampart:       { label: 'Rampart',       icon: '🛡️', baseCost: 3_000, effectLabel: '+15% defense power / level' },
  rally_point:   { label: 'Rally Point',   icon: '🗺️', baseCost: 1_500, effectLabel: 'Unlock attacks; +4 tile range / level' },
  vault_storage: { label: 'Vault Storage', icon: '📦', baseCost: 2_000, effectLabel: 'Shield +2,000 SMELT from raids / level' },
  smithy:        { label: 'Smithy',        icon: '⚗️', baseCost: 4_000, effectLabel: 'Unlock crafting; +1 craft slot / level' },
  war_hall:      { label: 'War Hall',      icon: '📯', baseCost: 5_000, effectLabel: '+10% weekly war score / level' },
  embassy:       { label: 'Embassy',       icon: '🤝', baseCost: 3_500, effectLabel: 'Join alliance; +5 reinforce cap / level' },
};

// Minutes to upgrade TO that level. Level 1 is instant (0 min).
export const BUILD_TIME_MINS: Record<number, number> = { 1: 0, 2: 30, 3: 60, 4: 120, 5: 240 };

// SMELT cost = baseCost × multiplier for the target level
export const COST_MULTIPLIER: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

export function buildCost(type: BuildingType, toLevel: number): number {
  return BUILDING_META[type].baseCost * (COST_MULTIPLIER[toLevel] ?? 16);
}

export interface ConstructionSlot {
  buildingType: BuildingType;
  toLevel: number;
  completesAt: string; // ISO timestamp
}

export interface ForgeBuildings {
  forgeId: number;
  smeltBalance: number;
  levels: Record<BuildingType, number>; // 0–5
  construction: ConstructionSlot | null;
  updatedAt: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const FILE = path.join(DATA_DIR, 'foundry-buildings.json');

type Store = Record<string, ForgeBuildings>; // key = forgeId string

function loadStore(): Store {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Store;
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

function emptyLevels(): Record<BuildingType, number> {
  return Object.fromEntries(ALL_BUILDINGS.map(b => [b, 0])) as Record<BuildingType, number>;
}

// ── Auto-complete construction on read ────────────────────────────────────────

function applyConstruction(fb: ForgeBuildings): { result: ForgeBuildings; dirty: boolean } {
  if (!fb.construction) return { result: fb, dirty: false };
  if (new Date(fb.construction.completesAt) > new Date()) return { result: fb, dirty: false };
  const result: ForgeBuildings = {
    ...fb,
    levels: { ...fb.levels, [fb.construction.buildingType]: fb.construction.toLevel },
    construction: null,
    updatedAt: new Date().toISOString(),
  };
  return { result, dirty: true };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getForgeBuildings(forgeId: number, seedSmelt = 0): ForgeBuildings {
  const store = loadStore();
  const key = String(forgeId);
  if (!store[key]) {
    store[key] = {
      forgeId,
      smeltBalance: seedSmelt,
      levels: emptyLevels(),
      construction: null,
      updatedAt: new Date().toISOString(),
    };
    saveStore(store);
  }
  const { result: fb, dirty } = applyConstruction(store[key]);
  if (dirty) {
    store[key] = fb;
    saveStore(store);
  }
  return fb;
}

export function saveForgeBuildings(fb: ForgeBuildings): void {
  const store = loadStore();
  store[String(fb.forgeId)] = { ...fb, updatedAt: new Date().toISOString() };
  saveStore(store);
}
