// lib/foundry-map.ts
import path from 'path';
import fs from 'fs';

export type TerrainType =
  | 'grass' | 'grass2' | 'forest' | 'hills'
  | 'water' | 'mountains' | 'cliffs'
  | 'desert' | 'swamp' | 'lava';

export const IMPASSABLE = new Set<TerrainType>(['water', 'mountains', 'cliffs']);

export interface ForgePlot {
  plotId: number; // 1–500
  row: number;
  col: number;
}

export interface WorldMap {
  width: number;   // 60
  height: number;  // 50
  tiles: TerrainType[][]; // tiles[row][col]
  forgePlots: ForgePlot[];
}

const MAP_PATH = path.join(process.cwd(), 'data', 'foundry-map.json');
const MAP_W = 60;
const MAP_H = 50;
const TOTAL_FORGE_PLOTS = 500;
const MIN_PLOT_SPACING = 2; // Manhattan distance minimum between forge plots
const GEN_SEED = 0xdeadbeef;

// Deterministic seeded RNG (Lehmer)
function makeRng(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s = Math.imul(s, 16807) >>> 0;
    if (s === 0) s = 1;
    return (s - 1) / 0xffffffff;
  };
}

export function generateMap(): WorldMap {
  const rng = makeRng(GEN_SEED);
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;

  // Build terrain grid
  const tiles: TerrainType[][] = [];
  for (let r = 0; r < MAP_H; r++) {
    tiles[r] = [];
    for (let c = 0; c < MAP_W; c++) {
      const dx = (c - cx) / cx;
      const dy = (r - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const n = rng();

      let t: TerrainType;
      if (dist > 0.92) {
        t = 'water';
      } else if (dist > 0.78 && n > 0.45) {
        t = 'water'; // coastal water
      } else if (n < 0.022) {
        t = 'lava';
      } else if (n < 0.05) {
        t = 'mountains';
      } else if (n < 0.055) {
        t = 'cliffs';
      } else if (n < 0.10) {
        t = 'hills';
      } else if (n < 0.16) {
        t = 'forest';
      } else if (n < 0.19) {
        t = 'desert';
      } else if (n < 0.21) {
        t = 'swamp';
      } else {
        t = n > 0.6 ? 'grass2' : 'grass';
      }
      tiles[r][c] = t;
    }
  }

  // Carve rivers: one horizontal, one vertical
  const riverR = Math.floor(MAP_H * 0.42);
  for (let c = Math.floor(MAP_W * 0.15); c < Math.floor(MAP_W * 0.55); c++) {
    if (!IMPASSABLE.has(tiles[riverR][c])) tiles[riverR][c] = 'water';
    if (riverR + 1 < MAP_H && !IMPASSABLE.has(tiles[riverR + 1][c]) && rng() > 0.5)
      tiles[riverR + 1][c] = 'water';
  }
  const riverC = Math.floor(MAP_W * 0.38);
  for (let r = Math.floor(MAP_H * 0.22); r < Math.floor(MAP_H * 0.65); r++) {
    if (!IMPASSABLE.has(tiles[r][riverC])) tiles[r][riverC] = 'water';
  }

  // Place forge plots: find traversable tiles in reading order, space them out
  const candidates: { row: number; col: number }[] = [];
  for (let r = 0; r < MAP_H; r++) {
    for (let c = 0; c < MAP_W; c++) {
      if (!IMPASSABLE.has(tiles[r][c])) candidates.push({ row: r, col: c });
    }
  }

  const forgePlots: ForgePlot[] = [];
  for (const cand of candidates) {
    if (forgePlots.length >= TOTAL_FORGE_PLOTS) break;
    // Check minimum spacing from all existing plots
    const tooClose = forgePlots.some(
      p => Math.abs(p.row - cand.row) + Math.abs(p.col - cand.col) < MIN_PLOT_SPACING
    );
    if (!tooClose) {
      forgePlots.push({ plotId: forgePlots.length + 1, row: cand.row, col: cand.col });
    }
  }

  return { width: MAP_W, height: MAP_H, tiles, forgePlots };
}

// Load map from disk (generated once, static forever)
let _cache: WorldMap | null = null;
export function loadMap(): WorldMap {
  if (_cache) return _cache;
  if (!fs.existsSync(MAP_PATH)) {
    throw new Error('foundry-map.json not found — run scripts/generate-foundry-map.ts first');
  }
  _cache = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8')) as WorldMap;
  return _cache;
}

// Look up a plot's world position by plotId
export function getPlotPosition(plotId: number): { row: number; col: number } | null {
  const map = loadMap();
  return map.forgePlots.find(p => p.plotId === plotId) ?? null;
}

// Get terrain at coordinates
export function getTileAt(row: number, col: number): TerrainType | null {
  const map = loadMap();
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return null;
  return map.tiles[row][col];
}

// Manhattan distance between two forge plots
export function plotDistance(plotIdA: number, plotIdB: number): number {
  const a = getPlotPosition(plotIdA);
  const b = getPlotPosition(plotIdB);
  if (!a || !b) return Infinity;
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
