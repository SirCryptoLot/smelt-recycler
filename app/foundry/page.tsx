// app/foundry/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
  neutral: '#3b82f6',
  empty:   'transparent',
};

const TILE_PX = 36;

// ── Tower marker (rises above tile via overflow:visible) ─────────────────────

function TowerMarker({ tier }: { tier: 'mine' | 'neutral' }) {
  const isMine = tier === 'mine';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, pointerEvents: 'none',
    }}>
      {/* Flag on pole */}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: 2, height: 8, background: isMine ? '#d4a438' : '#93c5fd' }} />
        <div style={{
          width: 10, height: 7,
          background: isMine ? '#ef4444' : '#3b82f6',
          clipPath: 'polygon(0 0, 100% 35%, 0 70%)',
        }} />
      </div>
      {/* Keep with battlements */}
      <div style={{
        width: 20, height: 16,
        background: isMine
          ? 'linear-gradient(to bottom, #d97706, #92400e)'
          : 'linear-gradient(to bottom, #1d4ed8, #1e3a5f)',
        border: `1.5px solid ${isMine ? '#fbbf24' : '#60a5fa'}`,
        borderRadius: '2px 2px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: isMine ? '#fff' : '#bfdbfe',
        position: 'relative',
        animation: isMine ? 'forge-glow 2s ease-in-out infinite' : undefined,
      }}>
        <div style={{
          position: 'absolute', top: -4, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-around', padding: '0 2px',
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4,
              background: isMine ? '#fbbf24' : '#60a5fa',
              borderRadius: '1px 1px 0 0',
            }} />
          ))}
        </div>
        {isMine ? '⚒' : '?'}
      </div>
      {/* Base */}
      <div style={{
        width: 24, height: 3,
        background: isMine ? '#78350f' : '#1e3a5f',
        borderRadius: '0 0 3px 3px',
      }} />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FoundryWorldMap() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [mapData, setMapData]     = useState<MapResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<MapForge | null>(null);
  const [scale, setScale]         = useState(1);
  const [offset, setOffset]       = useState({ x: 0, y: 0 });
  const [legendOpen, setLegendOpen] = useState(false);

  const wrapRef   = useRef<HTMLDivElement>(null);
  const miniRef   = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });
  const touchStartPos = useRef({ x: 0, y: 0 });
  const isTouching = useRef(false);

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

  // On load: center view on user's forge, or map center
  useEffect(() => {
    if (!mapData) return;
    const mine = mapData.forges.find(f => f.tier === 'mine');
    if (mine) {
      setOffset({
        x: mapData.width  * TILE_PX / 2 - mine.col * TILE_PX - TILE_PX / 2,
        y: mapData.height * TILE_PX / 2 - mine.row * TILE_PX - TILE_PX / 2,
      });
    }
    // else offset stays {0,0} = map center
  }, [mapData]);

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
      const r = f.tier === 'mine' ? 3 : 1.5;
      ctx.arc(f.col * tw + tw / 2, f.row * th + th / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [mapData]);

  // Drag-to-pan (mouse)
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

  // Drag-to-pan (touch)
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isTouching.current = true;
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isTouching.current || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = () => { isTouching.current = false; };

  const zoom = (f: number) => setScale(s => Math.min(Math.max(s * f, 0.3), 3));

  // These must be before any early return (Rules of Hooks)
  const myForge = mapData?.forges.find(f => f.tier === 'mine') ?? null;

  // Pre-build forge lookup: "row,col" → MapForge (avoids O(tiles × forges) scan per render)
  const forgeByPos = useMemo(() => {
    const m = new Map<string, MapForge>();
    mapData?.forges.forEach(f => m.set(`${f.row},${f.col}`, f));
    return m;
  }, [mapData]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-stone-50 text-amber-600 text-lg font-bold">
      Loading world map…
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden">

      {/* ── HUD ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-stone-200 shadow-sm flex-wrap">
        {myForge ? (
          <Link href={`/foundry/forge/${myForge.plotId}`}
            className="bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors">
            ⚒ Forge #{myForge.plotId} — manage
          </Link>
        ) : wallet ? (
          <Link href="/foundry/claim"
            className="bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-600 hover:bg-green-100 transition-colors">
            + Claim a Forge
          </Link>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-700">
            {mapData?.forges.filter(f => f.tier !== 'empty').length ?? 0} / 500 forges claimed
          </span>
          <button onClick={() => zoom(1.2)} className="w-7 h-7 bg-stone-100 border border-stone-300 rounded text-gray-600 text-sm hover:bg-stone-200 transition-colors">+</button>
          <button onClick={() => zoom(0.833)} className="w-7 h-7 bg-stone-100 border border-stone-300 rounded text-gray-600 text-sm hover:bg-stone-200 transition-colors">−</button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
            className="w-7 h-7 bg-stone-100 border border-stone-300 rounded text-gray-600 text-xs hover:bg-stone-200 transition-colors">⊙</button>
        </div>
      </div>

      {/* ── Map ── */}
      <div
        ref={wrapRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ background: '#c8dff0', touchAction: 'none' }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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
                    overflow: forge && forge.tier !== 'empty' ? 'visible' : undefined,
                    cursor: forge && forge.tier !== 'empty' ? 'pointer' : isPassable ? 'default' : 'not-allowed',
                    boxShadow: forge?.tier === 'mine' ? '0 0 8px #f59e0b88 inset' : undefined,
                  }}
                >
                  {/* Terrain icon */}
                  {!forge && TERRAIN_ICON[terrain] && (
                    <span style={{ opacity: 0.75, pointerEvents: 'none' }}>{TERRAIN_ICON[terrain]}</span>
                  )}
                  {/* Forge tower */}
                  {forge && forge.tier !== 'empty' && (
                    <TowerMarker tier={forge.tier === 'mine' ? 'mine' : 'neutral'} />
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

        {/* Legend — collapsible */}
        <div className="absolute top-3 left-3 bg-white/90 border border-stone-200 rounded-lg backdrop-blur-sm text-[10px] text-gray-600 overflow-hidden">
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 w-full hover:bg-stone-50 transition-colors"
          >
            <span className="font-bold text-gray-500 uppercase tracking-wider">Legend</span>
            <span className="ml-auto text-gray-400">{legendOpen ? '▲' : '▼'}</span>
          </button>
          {legendOpen && (
            <div className="px-2.5 pb-2.5 space-y-1">
              {(['grass', 'water', 'forest', 'hills', 'mountains', 'desert', 'lava'] as TerrainType[]).map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: TERRAIN_BG[t], border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                  <span className="capitalize">{t}</span>
                </div>
              ))}
              <div className="border-t border-stone-200 pt-1.5 mt-1 space-y-1">
                {([['mine', 'Your forge'], ['neutral', 'Claimed'], ['empty', 'Available']] as const).map(([tier, label]) => (
                  <div key={tier} className="flex items-center gap-1.5">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: FORGE_COLOR[tier], border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Minimap */}
        <div className="absolute bottom-3 right-3 hidden sm:block border border-stone-300 rounded-md overflow-hidden shadow-lg">
          <canvas ref={miniRef} width={140} height={116} />
        </div>

        {/* Forge popup */}
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div
              className="bg-white border border-stone-200 rounded-2xl p-5 max-w-xs w-full shadow-2xl pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-amber-600 font-extrabold text-lg mb-0.5">⚒ Forge #{selected.plotId}</div>
              <div className="text-[10px] text-gray-400 font-mono mb-3">{selected.owner}</div>
              {selected.inscription && (
                <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2.5 text-xs text-gray-700 italic leading-relaxed mb-3">
                  {selected.inscription}
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <Link href={`/foundry/forge/${selected.plotId}`}
                  className="flex-1 text-center bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-lg py-2 hover:bg-amber-100 transition-colors">
                  View Forge
                </Link>
                <button onClick={() => setSelected(null)}
                  className="flex-1 bg-stone-50 border border-stone-200 text-gray-500 text-xs rounded-lg py-2 hover:bg-stone-100 transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes forge-glow {
          0%, 100% { box-shadow: 0 0 5px #fbbf2466; }
          50% { box-shadow: 0 0 14px #fbbf24; }
        }
      `}</style>
    </div>
  );
}
