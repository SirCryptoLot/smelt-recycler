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
          <Link href="/foundry/claim"
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
