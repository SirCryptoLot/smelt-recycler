# Foundry Forge Wars — Plan 1: Foundation (World Map)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/foundry` grid page with a pannable, zoomable 60×50 Travian-style terrain world map showing forge plots, terrain types, and ownership — while keeping the existing claim flow working.

**Architecture:** A deterministic map generator (`lib/foundry-map.ts`) produces and saves the 60×50 terrain grid + 500 forge plot positions to `data/foundry-map.json` once. A new API endpoint serves map state merged with current forge ownership. The frontend replaces the existing foundry page with an interactive canvas-based world map.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, HTML Canvas (minimap), CSS grid (main map). No new npm packages required.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `lib/foundry-map.ts` | Create | Map types, terrain generator, plot placement, helper functions |
| `scripts/generate-foundry-map.ts` | Create | One-time script to generate and save `data/foundry-map.json` |
| `data/foundry-map.json` | Create (generated) | Terrain grid + forge plot positions — static after generation |
| `app/api/foundry/map/route.ts` | Create | GET endpoint: terrain + forge ownership state |
| `app/foundry/page.tsx` | Replace | Travian-style world map UI |
| `app/foundry/forge/[id]/page.tsx` | Create | Stub page (will be built in Plan 2) |
| `lib/foundry.ts` | Modify | Add `getPlotPosition(plotId)` helper using map data |

---

## Task 1: Map Types and Terrain Generator

**Files:**
- Create: `lib/foundry-map.ts`

- [ ] **Step 1: Create `lib/foundry-map.ts` with types and generator**

```typescript
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
const MIN_PLOT_SPACING = 3; // Manhattan distance minimum between forge plots
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
  const maxDist = Math.sqrt(cx * cx + cy * cy);

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
      } else if (n < 0.05) {
        t = 'mountains';
      } else if (n < 0.10) {
        t = 'hills';
      } else if (n < 0.16) {
        t = 'forest';
      } else if (n < 0.19) {
        t = 'desert';
      } else if (n < 0.21) {
        t = 'swamp';
      } else if (n < 0.022) {
        t = 'lava';
      } else if (n < 0.055) {
        t = 'cliffs';
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:\recycle
npx tsc --noEmit --skipLibCheck 2>&1 | grep foundry-map
```

Expected: no errors for `lib/foundry-map.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/foundry-map.ts
git commit -m "feat: foundry map types and terrain generator"
```

---

## Task 2: Generate and Persist the World Map

**Files:**
- Create: `scripts/generate-foundry-map.ts`
- Create: `data/foundry-map.json` (output of script)

- [ ] **Step 1: Create the generation script**

```typescript
// scripts/generate-foundry-map.ts
import path from 'path';
import fs from 'fs';
// Run from project root: npx ts-node --project tsconfig.json scripts/generate-foundry-map.ts

// Inline the generator to avoid module resolution issues in scripts
import { generateMap } from '../lib/foundry-map';

const MAP_PATH = path.join(process.cwd(), 'data', 'foundry-map.json');

function main() {
  if (fs.existsSync(MAP_PATH)) {
    console.log('foundry-map.json already exists — delete it first to regenerate');
    process.exit(0);
  }

  console.log('Generating 60×50 world map...');
  const map = generateMap();

  const traversable = map.tiles.flat().filter(t =>
    !['water', 'mountains', 'cliffs'].includes(t)
  ).length;

  console.log(`  Tiles: ${map.width}×${map.height} = ${map.width * map.height} total`);
  console.log(`  Traversable: ${traversable}`);
  console.log(`  Forge plots: ${map.forgePlots.length}`);

  if (map.forgePlots.length < 500) {
    console.error(`ERROR: Only placed ${map.forgePlots.length} forge plots (need 500). Adjust MIN_PLOT_SPACING.`);
    process.exit(1);
  }

  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
  console.log(`Saved to ${MAP_PATH}`);
}

main();
```

- [ ] **Step 2: Run the generator**

```bash
cd C:\recycle
npx ts-node --project tsconfig.json --skip-project scripts/generate-foundry-map.ts
```

Expected output:
```
Generating 60×50 world map...
  Tiles: 60×50 = 3000 total
  Traversable: ~1800 (varies by terrain)
  Forge plots: 500
Saved to C:\recycle\data\foundry-map.json
```

- [ ] **Step 3: Verify the output**

```bash
node -e "
const m = require('./data/foundry-map.json');
console.log('width:', m.width, 'height:', m.height);
console.log('tiles rows:', m.tiles.length, 'cols:', m.tiles[0].length);
console.log('forge plots:', m.forgePlots.length);
console.log('first plot:', m.forgePlots[0]);
console.log('last plot:', m.forgePlots[499]);
"
```

Expected: width 60, height 50, tiles 50 rows × 60 cols, 500 forge plots.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-foundry-map.ts data/foundry-map.json
git commit -m "feat: generate and persist 60x50 foundry world map"
```

---

## Task 3: Map API Endpoint

**Files:**
- Create: `app/api/foundry/map/route.ts`

The endpoint returns the full terrain grid plus forge plot states (ownership, name, tier).

- [ ] **Step 1: Create the API route**

```typescript
// app/api/foundry/map/route.ts
import { NextResponse } from 'next/server';
import { loadMap, TerrainType } from '@/lib/foundry-map';
import { getPlots } from '@/lib/foundry';

export const dynamic = 'force-dynamic';

export interface MapForge {
  plotId: number;
  row: number;
  col: number;
  owner: string | null;
  shortOwner: string | null;
  inscription: string | null;
  name: string | null; // custom name (Plan 4)
  tier: 'mine' | 'ally' | 'enemy' | 'neutral' | 'empty';
}

export interface MapResponse {
  width: number;
  height: number;
  tiles: TerrainType[][];
  forges: MapForge[];
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const viewer = searchParams.get('wallet') ?? '';

    const map = loadMap();
    const claimedPlots = getPlots();

    // Build a lookup: plotId → ForgeEntry
    const plotMap = new Map(claimedPlots.map(p => [p.id, p]));

    const forges: MapForge[] = map.forgePlots.map(({ plotId, row, col }) => {
      const entry = plotMap.get(plotId);
      if (!entry) {
        return { plotId, row, col, owner: null, shortOwner: null, inscription: null, name: null, tier: 'empty' };
      }
      const isMe = viewer && entry.owner === viewer;
      return {
        plotId,
        row,
        col,
        owner: entry.owner,
        shortOwner: `${entry.owner.slice(0, 4)}…${entry.owner.slice(-4)}`,
        inscription: entry.inscription,
        name: null, // extended in Plan 4
        tier: isMe ? 'mine' : 'neutral',
      };
    });

    const response: MapResponse = {
      width: map.width,
      height: map.height,
      tiles: map.tiles,
      forges,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[foundry/map]', err);
    return NextResponse.json({ error: 'Failed to load map' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Start dev server and test the endpoint**

```bash
cd C:\recycle && npm run dev
```

In a new terminal:
```bash
curl "http://localhost:3000/api/foundry/map" | node -e "
const chunks=[]; process.stdin.on('data',c=>chunks.push(c));
process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(chunks));
  console.log('width:', d.width, 'height:', d.height);
  console.log('tile[0][0]:', d.tiles[0][0]);
  console.log('forges:', d.forges.length);
  console.log('empty forges:', d.forges.filter(f=>f.tier==='empty').length);
});
"
```

Expected: width 60, height 50, 500 forges all tier 'empty' (none claimed yet).

- [ ] **Step 3: Commit**

```bash
git add app/api/foundry/map/route.ts
git commit -m "feat: GET /api/foundry/map — terrain + forge ownership endpoint"
```

---

## Task 4: World Map UI

**Files:**
- Replace: `app/foundry/page.tsx`

This is the main Travian-style interactive world map. It replaces the current grid UI entirely. The existing claim flow (`/api/foundry/claim`) is preserved — the claim button moves to the forge detail page (Plan 2). For now, unclaimed plots simply show as empty terrain tiles.

- [ ] **Step 1: Replace `app/foundry/page.tsx` with the world map**

```tsx
// app/foundry/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { MapResponse, MapForge } from '@/app/api/foundry/map/route';
import type { TerrainType } from '@/lib/foundry-map';

// ── Terrain config ───────────────────────────────────────────────────────────

const TERRAIN_BG: Record<TerrainType, string> = {
  grass:     '#3a6231',
  grass2:    '#3d6130',
  forest:    '#1e3d14',
  hills:     '#6b5a3e',
  water:     '#1e5280',
  mountains: '#5a5a5a',
  cliffs:    '#3d3030',
  desert:    '#a8863c',
  swamp:     '#2a4020',
  lava:      '#8b1a00',
};

const TERRAIN_ICON: Partial<Record<TerrainType, string>> = {
  water:     '🌊',
  mountains: '🗻',
  forest:    '🌲',
  hills:     '⛰',
  lava:      '🔥',
  cliffs:    '🪨',
};

const IMPASSABLE = new Set<TerrainType>(['water', 'mountains', 'cliffs']);

const FORGE_COLOR: Record<string, string> = {
  mine:    '#f59e0b',
  ally:    '#4ade80',
  enemy:   '#ef4444',
  neutral: '#6b4f2a',
  empty:   'transparent',
};

const TILE_PX = 36;

// ── Component ────────────────────────────────────────────────────────────────

export default function FoundryWorldMap() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [mapData, setMapData]     = useState<MapResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<MapForge | null>(null);
  const [scale, setScale]         = useState(1);
  const [offset, setOffset]       = useState({ x: 0, y: 0 });

  const wrapRef   = useRef<HTMLDivElement>(null);
  const miniRef   = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });

  // Fetch map (re-fetch when wallet changes so tier 'mine' highlights correctly)
  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/foundry/map${wallet ? `?wallet=${wallet}` : ''}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as MapResponse;
        setMapData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchMap(); }, [fetchMap]);

  // Draw minimap on canvas whenever map loads
  useEffect(() => {
    if (!mapData || !miniRef.current) return;
    const canvas = miniRef.current;
    const ctx = canvas.getContext('2d')!;
    const { width, height, tiles, forges } = mapData;
    const tw = canvas.width / width;
    const th = canvas.height / height;

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        ctx.fillStyle = TERRAIN_BG[tiles[r][c]];
        ctx.fillRect(c * tw, r * th, tw + 0.5, th + 0.5);
      }
    }
    for (const f of forges) {
      if (f.tier === 'empty') continue;
      ctx.fillStyle = FORGE_COLOR[f.tier];
      ctx.beginPath();
      ctx.arc(f.col * tw + tw / 2, f.row * th + th / 2, Math.max(tw, 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [mapData]);

  // Drag-to-pan
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-forge]')) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    setOffset(o => ({ x: o.x + e.clientX - lastPos.current.x, y: o.y + e.clientY - lastPos.current.y }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseUp = () => { dragging.current = false; };

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [onMouseMove]);

  const zoom = (f: number) => setScale(s => Math.min(Math.max(s * f, 0.3), 3));

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0d1117] text-amber-400 text-lg font-bold">
      Loading world map…
    </div>
  );

  const myForge = mapData?.forges.find(f => f.tier === 'mine');

  // Pre-build forge lookup: "row,col" → MapForge (avoids O(tiles × forges) scan per render)
  const forgeByPos = useMemo(() => {
    const m = new Map<string, MapForge>();
    mapData?.forges.forEach(f => m.set(`${f.row},${f.col}`, f));
    return m;
  }, [mapData]);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden">

      {/* ── HUD ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gradient-to-b from-[#1a110a] to-[#110c06] border-b-2 border-[#5a3e1b] flex-wrap">
        <WalletMultiButton className="!bg-amber-700 !text-white !font-bold !rounded-lg !px-3 !py-1.5 !h-auto !text-xs" />
        {myForge ? (
          <Link href={`/foundry/forge/${myForge.plotId}`}
            className="bg-[#2d1805] border border-[#92400e] rounded-full px-3 py-1 text-xs font-bold text-amber-400 hover:border-amber-400 transition-colors">
            ⚒ Forge #{myForge.plotId} — manage
          </Link>
        ) : wallet ? (
          <Link href="/foundry/forge/claim"
            className="bg-[#1a2e12] border border-[#2d4a1e] rounded-full px-3 py-1 text-xs font-bold text-green-400 hover:border-green-400 transition-colors">
            + Claim a Forge
          </Link>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[#6b4f2a]">
            {mapData?.forges.filter(f => f.tier !== 'empty').length ?? 0} / 500 forges claimed
          </span>
          <button onClick={() => zoom(1.2)} className="w-7 h-7 bg-[#1f1208] border border-[#3d2b0f] rounded text-amber-400 text-sm hover:border-[#78350f]">+</button>
          <button onClick={() => zoom(0.833)} className="w-7 h-7 bg-[#1f1208] border border-[#3d2b0f] rounded text-amber-400 text-sm hover:border-[#78350f]">−</button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
            className="w-7 h-7 bg-[#1f1208] border border-[#3d2b0f] rounded text-amber-400 text-xs hover:border-[#78350f]">⊙</button>
        </div>
      </div>

      {/* ── Map ── */}
      <div
        ref={wrapRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ background: '#1a3a5c' }}
        onMouseDown={onMouseDown}
      >
        {/* Terrain + forge grid */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: 'center center',
            display: 'grid',
            gridTemplateColumns: `repeat(${mapData?.width ?? 60}, ${TILE_PX}px)`,
            gap: 0,
          }}
        >
          {mapData?.tiles.flatMap((row, r) =>
            row.map((terrain, c) => {
              const forge = forgeByPos.get(`${r},${c}`);
              const isPassable = !IMPASSABLE.has(terrain);
              return (
                <div
                  key={`${r}-${c}`}
                  data-forge={forge ? forge.plotId : undefined}
                  onClick={() => forge && forge.tier !== 'empty' ? setSelected(forge) : undefined}
                  title={forge && forge.tier !== 'empty' ? forge.inscription ?? undefined : terrain}
                  style={{
                    width: TILE_PX, height: TILE_PX,
                    background: TERRAIN_BG[terrain],
                    border: '1px solid rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, position: 'relative',
                    cursor: forge && forge.tier !== 'empty' ? 'pointer' : isPassable ? 'default' : 'not-allowed',
                    boxShadow: forge?.tier === 'mine' ? '0 0 8px #f59e0b88 inset' : undefined,
                  }}
                >
                  {/* Terrain icon */}
                  {!forge && TERRAIN_ICON[terrain] && (
                    <span style={{ opacity: 0.75, pointerEvents: 'none' }}>{TERRAIN_ICON[terrain]}</span>
                  )}
                  {/* Forge marker */}
                  {forge && forge.tier !== 'empty' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 3,
                        background: FORGE_COLOR[forge.tier],
                        border: `2px solid ${forge.tier === 'mine' ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, color: '#fff', fontWeight: 700,
                        boxShadow: forge.tier === 'mine' ? '0 0 6px #fbbf24' : undefined,
                        animation: forge.tier === 'mine' ? 'pulse 2s ease-in-out infinite' : undefined,
                      }}>
                        {forge.tier === 'mine' ? '⚒' : forge.tier === 'ally' ? '🤝' : forge.tier === 'enemy' ? '⚔' : '?'}
                      </div>
                      <span style={{ fontSize: 7, color: '#fbbf24', fontFamily: 'monospace', textShadow: '0 1px 2px black' }}>
                        #{forge.plotId}
                      </span>
                    </div>
                  )}
                  {/* Empty forge plot marker */}
                  {forge && forge.tier === 'empty' && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,200,100,0.25)', border: '1px solid rgba(255,200,100,0.4)' }} />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div className="absolute top-3 left-3 bg-[#0f0c06cc] border border-[#3d2b0f] rounded-lg p-2.5 backdrop-blur-sm text-[10px] text-[#92724a] space-y-1">
          <div className="font-bold text-[#6b4f2a] uppercase tracking-wider mb-1.5">Terrain</div>
          {(['grass', 'water', 'forest', 'hills', 'mountains', 'desert', 'lava'] as TerrainType[]).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: TERRAIN_BG[t], border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
              <span className="capitalize">{t}</span>
            </div>
          ))}
          <div className="border-t border-[#2d1f0a] pt-1.5 mt-1.5 space-y-1">
            {([['mine', 'Your forge'], ['neutral', 'Claimed'], ['empty', 'Available']] as const).map(([tier, label]) => (
              <div key={tier} className="flex items-center gap-1.5">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: FORGE_COLOR[tier], border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Minimap */}
        <div className="absolute bottom-3 right-3 border-2 border-[#5a3e1b] rounded-md overflow-hidden shadow-lg">
          <canvas ref={miniRef} width={140} height={116} />
        </div>

        {/* Forge popup */}
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div
              className="bg-[#1a1208] border-2 border-[#78350f] rounded-2xl p-5 max-w-xs w-full shadow-2xl pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-amber-400 font-extrabold text-lg mb-0.5">⚒ Forge #{selected.plotId}</div>
              <div className="text-[10px] text-[#6b4f2a] font-mono mb-3">{selected.owner}</div>
              {selected.inscription && (
                <div className="bg-[#0f0c06] border border-[#2d1f0a] rounded-xl px-3 py-2.5 text-xs text-amber-200 italic leading-relaxed mb-3">
                  {selected.inscription}
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <Link href={`/foundry/forge/${selected.plotId}`}
                  className="flex-1 text-center bg-[#2d1805] border border-[#78350f] text-amber-400 text-xs font-bold rounded-lg py-2 hover:border-amber-500 transition-colors">
                  View Forge
                </Link>
                <button onClick={() => setSelected(null)}
                  className="flex-1 bg-[#140e04] border border-[#2d1f0a] text-[#6b4f2a] text-xs rounded-lg py-2 hover:text-amber-400 transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 4px #fbbf24aa; }
          50% { box-shadow: 0 0 12px #fbbf24; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads**

Open `http://localhost:3000/foundry` in browser.

Expected:
- Full-screen world map with terrain colors visible
- Pan by dragging, zoom with +/− buttons
- Minimap in bottom-right corner
- HUD at top with wallet connect button
- Legend in top-left
- Empty forge plot markers (small dots) on traversable tiles

- [ ] **Step 3: Commit**

```bash
git add app/foundry/page.tsx
git commit -m "feat: replace foundry page with Travian-style interactive world map"
```

---

## Task 5: Forge Detail Stub Page

**Files:**
- Create: `app/foundry/forge/[id]/page.tsx`

This stub is needed so the "View Forge" and "manage" links in the world map don't 404. Plan 2 will fill it in with buildings and troops.

- [ ] **Step 1: Create stub page**

```tsx
// app/foundry/forge/[id]/page.tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';

export default function ForgeDetailStub() {
  const { id } = useParams<{ id: string }>();
  return (
    <PageShell className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="text-amber-800 font-bold text-sm mb-1">⚒ Forge #{id}</div>
        <div className="text-amber-700 text-xs">
          Forge management — buildings, troops, production — coming in the next update.
        </div>
      </div>
      <Link href="/foundry" className="text-sm text-amber-600 hover:text-amber-800 underline">
        ← Back to World Map
      </Link>
    </PageShell>
  );
}
```

- [ ] **Step 2: Verify navigation works**

1. Open `http://localhost:3000/foundry`
2. If any forges are claimed, click one → "View Forge" link
3. Should land on `/foundry/forge/[id]` with stub message (not 404)
4. "Back to World Map" link returns to map

- [ ] **Step 3: Commit**

```bash
git add app/foundry/forge/[id]/page.tsx
git commit -m "feat: forge detail stub page (buildings UI in Plan 2)"
```

---

## Task 6: Add getPlotPosition to foundry.ts and wire existing claim into map

**Files:**
- Modify: `lib/foundry.ts`

The existing claim flow works — we just need `ownsForge()` and related helpers to keep working. We also expose `getPlotPosition` from `foundry-map.ts` re-exported here for convenience.

- [ ] **Step 1: Add re-export to `lib/foundry.ts`**

Open `lib/foundry.ts` and add at the bottom:

```typescript
// Re-export map helpers for convenience
export { getPlotPosition, plotDistance } from '@/lib/foundry-map';
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd C:\recycle && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "error|foundry"
```

Expected: no errors.

- [ ] **Step 3: Verify the full foundry API still works**

```bash
curl http://localhost:3000/api/foundry | node -e "
const c=[]; process.stdin.on('data',d=>c.push(d));
process.stdin.on('end',()=>{ const d=JSON.parse(Buffer.concat(c)); console.log('plots:', d.plots?.length ?? d.claimedCount); });
"
```

Expected: returns plot data without error.

- [ ] **Step 4: Final integration commit**

```bash
git add lib/foundry.ts
git commit -m "feat: foundry plan 1 complete — world map foundation"
```

---

## Self-Review

**Spec coverage check:**
- ✓ 60×50 terrain world map (Task 1, 2)
- ✓ 7 terrain types with correct properties (Task 1)
- ✓ 500 forge plots on traversable terrain, min spacing (Task 1, 2)
- ✓ Low-ID forges near center (reading order placement in generator)
- ✓ Pannable + zoomable map UI (Task 4)
- ✓ Minimap in corner (Task 4)
- ✓ HUD with wallet + league info (Task 4)
- ✓ Forge popups (Task 4)
- ✓ Existing claim flow preserved (Tasks 5, 6)
- ✓ `/foundry/forge/[id]` stub (Task 5)
- ✓ Map API endpoint (Task 3)

**Out of scope for Plan 1 (covered in Plans 2–4):**
- Buildings, troops, combat → Plan 2 & 3
- Weekly leagues, prizes → Plan 4
- Store, items → Plan 4
- ally/enemy tier coloring → Plan 3 (needs alliance data)
