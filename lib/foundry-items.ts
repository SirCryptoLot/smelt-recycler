// lib/foundry-items.ts
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './paths';

// ── Item catalogue ────────────────────────────────────────────────────────────

export type ItemId =
  | 'lightning_rod'
  | 'crystal_bellows'
  | 'nameplate'
  | 'banner'
  | 'war_horn'
  | 'iron_shield';

export interface ItemMeta {
  label: string;
  icon: string;
  description: string;
  cost: number;       // SMELT
  type: 'permanent' | 'consumable';
  cap: number | null; // null = unlimited
  comingSoon?: boolean; // shown in catalogue but not purchasable yet
}

export const ITEM_CATALOGUE: Record<ItemId, ItemMeta> = {
  lightning_rod:   { label: 'Lightning Rod',    icon: '⚡', description: '+15% war score (stacks, max 3)',          cost:  35, type: 'permanent',   cap: 3          },
  crystal_bellows: { label: 'Crystal Bellows',  icon: '💎', description: '+20% SOL staking distribution weight',    cost:  50, type: 'permanent',   cap: null,      comingSoon: true },
  nameplate:       { label: 'Forge Nameplate',  icon: '🏷️', description: 'Set a custom forge name (20 chars max)',  cost:  10, type: 'permanent',   cap: null,      comingSoon: true },
  banner:          { label: 'Territorial Banner',icon: '🗺️', description: 'Custom map tile color for your forge',   cost:   8, type: 'permanent',   cap: null,      comingSoon: true },
  war_horn:        { label: 'War Horn',          icon: '📯', description: '2× war score for 7 days',                cost:  12, type: 'consumable',  cap: null       },
  iron_shield:     { label: 'Iron Shield',       icon: '🛡️', description: 'Block one league rank drop at season end', cost:  5, type: 'consumable',  cap: null       },
};

export const ALL_ITEMS = Object.keys(ITEM_CATALOGUE) as ItemId[];

// ── Owned items per forge ─────────────────────────────────────────────────────

export interface ForgeItems {
  forgeId: number;
  lightningRods: number;        // 0–3
  crystalBellows: number;       // count owned
  nameplate: string | null;     // custom name, max 20 chars
  bannerColor: string | null;   // hex color e.g. "#ff6600"
  warHornExpiresAt: string | null; // ISO — active if in future
  ironShieldsBought: number;    // lifetime count purchased
}

// ── Persistence ───────────────────────────────────────────────────────────────

const FILE = path.join(DATA_DIR, 'foundry-items.json');

type Store = Record<string, ForgeItems>; // key = forgeId string

function loadStore(): Store {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Store;
  } catch (err) {
    console.error('[foundry-items] Failed to load store:', err);
    return {};
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

function emptyItems(forgeId: number): ForgeItems {
  return {
    forgeId,
    lightningRods: 0,
    crystalBellows: 0,
    nameplate: null,
    bannerColor: null,
    warHornExpiresAt: null,
    ironShieldsBought: 0,
  };
}

export function getForgeItems(forgeId: number): ForgeItems {
  const store = loadStore();
  return store[String(forgeId)] ?? emptyItems(forgeId);
}

export function saveForgeItems(items: ForgeItems): void {
  const store = loadStore();
  store[String(items.forgeId)] = items;
  saveStore(store);
}

// ── Item effect helpers ───────────────────────────────────────────────────────

/** True if the War Horn is currently active */
export function warHornActive(items: ForgeItems): boolean {
  if (!items.warHornExpiresAt) return false;
  return new Date(items.warHornExpiresAt) > new Date();
}
