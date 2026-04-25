// lib/foundry-combat.ts
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from './paths';
import { TroopCount, TROOP_META } from './foundry-troops';
import { TerrainType } from './foundry-map';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttackOutcome = 'attacker_wins' | 'defender_wins';

export interface AttackRecord {
  id: string;                  // e.g. "1714000000000-a3f2b1"
  attackerForgeId: number;
  defenderForgeId: number;
  sentTroops: TroopCount;      // troops sent by attacker
  arrivesAt: string;           // ISO — when battle resolves
  createdAt: string;
  resolvedAt: string | null;   // null = still in flight
  outcome: AttackOutcome | null;
  smeltStolen: number;
  attackerLosses: TroopCount;
  defenderLosses: TroopCount;
}

// ── Terrain defence bonus ─────────────────────────────────────────────────────

const TERRAIN_DEF_BONUS: Partial<Record<TerrainType, number>> = {
  hills:  1.25,
  forest: 1.10,
  lava:   0.85,
};

export function terrainDefBonus(terrain: TerrainType): number {
  return TERRAIN_DEF_BONUS[terrain] ?? 1.0;
}

// ── Power calculations ────────────────────────────────────────────────────────

export function calcAttackPower(troops: TroopCount): number {
  return (
    troops.smelters    * TROOP_META.smelters.atk    +
    troops.ash_archers * TROOP_META.ash_archers.atk +
    troops.iron_guards * TROOP_META.iron_guards.atk
  );
}

export function calcDefPower(
  troops: TroopCount,
  rampartLevel: number,
  terrain: TerrainType,
): number {
  const base =
    troops.smelters    * TROOP_META.smelters.def    +
    troops.ash_archers * TROOP_META.ash_archers.def +
    troops.iron_guards * TROOP_META.iron_guards.def;
  return base * (1 + rampartLevel * 0.15) * terrainDefBonus(terrain);
}

// ── Troop arithmetic ──────────────────────────────────────────────────────────

/** Calculate troop losses as a fraction of the force (floor, never below 0). Returns the NUMBER of troops lost. */
export function calcTroopLosses(troops: TroopCount, fraction: number): TroopCount {
  return {
    smelters:    Math.min(troops.smelters,    Math.floor(troops.smelters    * fraction)),
    ash_archers: Math.min(troops.ash_archers, Math.floor(troops.ash_archers * fraction)),
    iron_guards: Math.min(troops.iron_guards, Math.floor(troops.iron_guards * fraction)),
  };
}

export function subtractTroops(a: TroopCount, b: TroopCount): TroopCount {
  return {
    smelters:    Math.max(0, a.smelters    - b.smelters),
    ash_archers: Math.max(0, a.ash_archers - b.ash_archers),
    iron_guards: Math.max(0, a.iron_guards - b.iron_guards),
  };
}

export function addTroops(a: TroopCount, b: TroopCount): TroopCount {
  return {
    smelters:    a.smelters    + b.smelters,
    ash_archers: a.ash_archers + b.ash_archers,
    iron_guards: a.iron_guards + b.iron_guards,
  };
}

export function totalTroops(t: TroopCount): number {
  return t.smelters + t.ash_archers + t.iron_guards;
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function makeAttackId(): string {
  return crypto.randomUUID();
}

// ── Persistence ───────────────────────────────────────────────────────────────

const FILE = path.join(DATA_DIR, 'foundry-attacks.json');

function loadStore(): AttackRecord[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as AttackRecord[];
  } catch {
    return [];
  }
}

function saveStore(records: AttackRecord[]): void {
  fs.writeFileSync(FILE, JSON.stringify(records, null, 2));
}

export function getPendingAttacks(): AttackRecord[] {
  return loadStore().filter(r => r.resolvedAt === null);
}

export function getForgeAttacks(forgeId: number): AttackRecord[] {
  return loadStore().filter(
    r => r.attackerForgeId === forgeId || r.defenderForgeId === forgeId,
  );
}

export function saveAttack(record: AttackRecord): void {
  const store = loadStore();
  const idx = store.findIndex(r => r.id === record.id);
  if (idx >= 0) store[idx] = record;
  else store.push(record);
  saveStore(store);
}
