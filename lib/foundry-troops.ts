// lib/foundry-troops.ts
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './paths';

// ── Types ────────────────────────────────────────────────────────────────────

export type TroopType = 'smelters' | 'ash_archers' | 'iron_guards';

export const ALL_TROOPS: TroopType[] = ['smelters', 'ash_archers', 'iron_guards'];

export const TROOP_META: Record<TroopType, {
  label: string;
  icon: string;
  atk: number;
  def: number;
  cost: number;      // SMELT per troop
  trainMins: number; // base minutes per troop (before Barracks reduction)
}> = {
  smelters:    { label: 'Smelters',    icon: '⚔️', atk: 40, def: 25, cost:   2, trainMins: 5 },
  ash_archers: { label: 'Ash Archers', icon: '🏹', atk: 60, def: 15, cost:   4, trainMins: 8 },
  iron_guards: { label: 'Iron Guards', icon: '🛡️', atk: 20, def: 80, cost:   3, trainMins: 7 },
};

export const BASE_TROOP_CAPACITY = 20;
export const CAPACITY_PER_BARRACKS = 5; // +5 per Barracks level

export interface TroopCount {
  smelters: number;
  ash_archers: number;
  iron_guards: number;
}

export interface TrainingItem {
  type: TroopType;
  quantity: number;
  completesAt: string; // ISO — when all troops in this batch complete
}

export interface ForgeTroops {
  forgeId: number;
  stationed: TroopCount;
  trainingQueue: TrainingItem[];
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function emptyTroopCount(): TroopCount {
  return { smelters: 0, ash_archers: 0, iron_guards: 0 };
}

export function totalStationed(troops: ForgeTroops): number {
  return troops.stationed.smelters + troops.stationed.ash_archers + troops.stationed.iron_guards;
}

export function totalQueued(troops: ForgeTroops): number {
  return troops.trainingQueue.reduce((s, t) => s + t.quantity, 0);
}

// Minutes per troop after Barracks reduction (−10% per level, min 1 min)
export function trainMinsPerTroop(troopType: TroopType, barracksLevel: number): number {
  const base = TROOP_META[troopType].trainMins;
  return Math.max(1, base * (1 - barracksLevel * 0.10));
}

// ── Auto-complete training queue on read ──────────────────────────────────────

function applyTrainingQueue(ft: ForgeTroops): { result: ForgeTroops; dirty: boolean } {
  const now = new Date();
  const remaining: TrainingItem[] = [];
  const stationed = { ...ft.stationed };

  for (const item of ft.trainingQueue) {
    if (new Date(item.completesAt) <= now) {
      stationed[item.type] += item.quantity;
    } else {
      remaining.push(item);
    }
  }

  const dirty = remaining.length !== ft.trainingQueue.length;
  if (!dirty) return { result: ft, dirty: false };

  const result: ForgeTroops = {
    ...ft,
    stationed,
    trainingQueue: remaining,
    updatedAt: new Date().toISOString(),
  };
  return { result, dirty: true };
}

// ── Persistence ───────────────────────────────────────────────────────────────

const FILE = path.join(DATA_DIR, 'foundry-troops.json');

type Store = Record<string, ForgeTroops>;

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

// ── Public API ────────────────────────────────────────────────────────────────

export function getForgeTroops(forgeId: number): ForgeTroops {
  const store = loadStore();
  const key = String(forgeId);
  if (!store[key]) {
    store[key] = {
      forgeId,
      stationed: emptyTroopCount(),
      trainingQueue: [],
      updatedAt: new Date().toISOString(),
    };
    saveStore(store);
  }
  const { result: ft, dirty } = applyTrainingQueue(store[key]);
  if (dirty) {
    store[key] = ft;
    saveStore(store);
  }
  return ft;
}

export function saveForgeTroops(ft: ForgeTroops): void {
  const store = loadStore();
  store[String(ft.forgeId)] = { ...ft, updatedAt: new Date().toISOString() };
  saveStore(store);
}
