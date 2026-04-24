// lib/foundry-constants.ts
// Pure constants only — no fs/path imports, safe for client components

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

export const BUILD_TIME_MINS: Record<number, number> = { 1: 0, 2: 30, 3: 60, 4: 120, 5: 240 };
export const COST_MULTIPLIER: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

export function buildCost(type: BuildingType, toLevel: number): number {
  return BUILDING_META[type].baseCost * (COST_MULTIPLIER[toLevel] ?? 16);
}

export type TroopType = 'smelters' | 'ash_archers' | 'iron_guards';

export const ALL_TROOPS: TroopType[] = ['smelters', 'ash_archers', 'iron_guards'];

export const TROOP_META: Record<TroopType, {
  label: string;
  icon: string;
  atk: number;
  def: number;
  cost: number;
  trainMins: number;
}> = {
  smelters:    { label: 'Smelters',    icon: '⚔️', atk: 40, def: 25, cost: 200, trainMins: 5 },
  ash_archers: { label: 'Ash Archers', icon: '🏹', atk: 60, def: 15, cost: 350, trainMins: 8 },
  iron_guards: { label: 'Iron Guards', icon: '🛡️', atk: 20, def: 80, cost: 300, trainMins: 7 },
};
