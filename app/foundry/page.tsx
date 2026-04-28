// app/foundry/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import type { MapResponse, MapForge } from '@/app/api/foundry/map/route';
import type { TerrainType } from '@/lib/foundry-map';
import { GameNav } from '@/components/foundry/GameNav';

// ── Terrain config ────────────────────────────────────────────────────────────

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

// ── Tower marker ──────────────────────────────────────────────────────────────

function TowerMarker({ tier }: { tier: 'mine' | 'neutral' }) {
  const isMine = tier === 'mine';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: 2, height: 8, background: isMine ? '#d4a438' : '#93c5fd' }} />
        <div style={{
          width: 10, height: 7,
          background: isMine ? '#ef4444' : '#3b82f6',
          clipPath: 'polygon(0 0, 100% 35%, 0 70%)',
        }} />
      </div>
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
      <div style={{
        width: 24, height: 3,
        background: isMine ? '#78350f' : '#1e3a5f',
        borderRadius: '0 0 3px 3px',
      }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FoundryWorldMap() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? '';

  const [mapData, setMapData]       = useState<MapResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<MapForge | null>(null);
  const [scale, setScale]           = useState(1);
  const [offset, setOffset]         = useState({ x: 0, y: 0 });
  const [legendOpen, setLegendOpen] = useState(false);

  const wrapRef  = useRef<HTMLDivElement>(null);
  const miniRef  = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const lastPos  = useRef({ x: 0, y: 0 });

  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/foundry/map${wallet ? `?wallet=${wallet}` : ''}`, { cache: 'no-store' });
      if (res.ok) setMapData(await res.json() as MapResponse);
    } finally { setLoading(false); }
  }, [wallet]);

  useEffect(() => { fetchMap(); }, [fetchMap]);

  // Center on user forge (or map center) on load
  useEffect(() => {
    if (!mapData) return;
    const mine = mapData.forges.find(f => f.tier === 'mine');
    if (mine) {
      setOffset({
        x: mapData.width  * TILE_PX / 2 - mine.col * TILE_PX - TILE_PX / 2,
        y: mapData.height * TILE_PX / 2 - mine.row * TILE_PX - TILE_PX / 2,
      });
    }
  }, [mapData]);

  // Minimap
  useEffect(() => {
    if (!mapData || !miniRef.current) return;
    const canvas = miniRef.current;
    const ctx = canvas.getContext('2d')!;
    const { width, height, tiles, forges } = mapData;
    const tw = canvas.width / width;
    const th = canvas.height / height;
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        ctx.fillStyle = TERRAIN_BG[tiles[r][c]];
        ctx.fillRect(c * tw, r * th, tw + 0.5, th + 0.5);
      }
    for (const f of forges) {
      if (f.tier === 'empty') continue;
      ctx.fillStyle = FORGE_COLOR[f.tier];
      ctx.beginPath();
      ctx.arc(f.col * tw + tw / 2, f.row * th + th / 2, f.tier === 'mine' ? 3 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [mapData]);

  // ── Pointer-based drag + tap detection ───────────────────────────────────
  const startPos = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    startPos.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setOffset(o => ({
      x: o.x + e.clientX - lastPos.current.x,
      y: o.y + e.clientY - lastPos.current.y,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      // tap — find forge under pointer
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const forgeEl = el?.closest('[data-forge-id]');
      if (forgeEl) {
        const plotId = Number(forgeEl.getAttribute('data-forge-id'));
        const forge = mapData?.forges.find(f => f.plotId === plotId && f.tier !== 'empty');
        if (forge) setSelected(forge);
      }
    }
  };

  const zoom = (f: number) => setScale(s => Math.min(Math.max(s * f, 0.3), 3));

  const myForge = mapData?.forges.find(f => f.tier === 'mine') ?? null;

  const forgeByPos = useMemo(() => {
    const m = new Map<string, MapForge>();
    mapData?.forges.forEach(f => m.set(`${f.row},${f.col}`, f));
    return m;
  }, [mapData]);

  if (loading) return (
    <div className="flex items-center justify-center flex-1 bg-stone-900 text-amber-400 font-bold">
      Loading world map…
    </div>
  );

  const claimedCount = mapData?.forges.filter(f => f.tier !== 'empty').length ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ background: '#0f1a0f' }}>

      {/* ── HUD ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(0,0,0,0.75)', borderBottom: '1px solid #2d3d2d' }}>

        {myForge ? (
          <Link href={`/foundry/forge/${myForge.plotId}`}
            style={{
              background: 'linear-gradient(135deg, #b45309, #78350f)',
              border: '1px solid #f59e0b55',
              borderRadius: 8, padding: '4px 12px',
              fontSize: 12, fontWeight: 800, color: '#fde68a',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
            ⚒ Forge #{myForge.plotId}
          </Link>
        ) : wallet ? (
          <Link href="/foundry/claim"
            style={{
              background: '#14532d', border: '1px solid #22c55e55',
              borderRadius: 8, padding: '4px 12px',
              fontSize: 12, fontWeight: 700, color: '#86efac',
              textDecoration: 'none',
            }}>
            + Claim Forge
          </Link>
        ) : null}

        <span style={{ fontSize: 11, color: '#4a6a4a' }}>
          {claimedCount} / 500
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => zoom(1.25)}
            style={{ width: 28, height: 28, background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 6, color: '#86efac', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            +
          </button>
          <button onClick={() => zoom(0.8)}
            style={{ width: 28, height: 28, background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 6, color: '#86efac', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            −
          </button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
            style={{ width: 28, height: 28, background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 6, color: '#6b9e6b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Reset view">
            ⌂
          </button>
        </div>
      </div>

      {/* ── Map ── */}
      <div
        ref={wrapRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background:
            'radial-gradient(ellipse 90% 70% at 50% 50%, #1e5280 0%, #0d2a4a 55%, #04101e 100%)',
          touchAction: 'none', cursor: 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Faint repeating wave pattern over the deep ocean — adds texture beyond grid edges */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.018) 14px 28px)',
            mixBlendMode: 'overlay',
          }}
        />
        {/* Grid */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
          transformOrigin: 'center center',
          display: 'grid',
          gridTemplateColumns: `repeat(${mapData?.width ?? 60}, ${TILE_PX}px)`,
          gap: 0, userSelect: 'none',
        }}>
          {mapData?.tiles.flatMap((row, r) =>
            row.map((terrain, c) => {
              const forge = forgeByPos.get(`${r},${c}`);
              const isPassable = !IMPASSABLE.has(terrain);
              return (
                <div
                  key={`${r}-${c}`}
                  data-forge-id={forge && forge.tier !== 'empty' ? forge.plotId : undefined}
                  title={forge && forge.tier !== 'empty' ? forge.inscription ?? undefined : terrain}
                  style={{
                    width: TILE_PX, height: TILE_PX,
                    background: TERRAIN_BG[terrain],
                    border: '1px solid rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, position: 'relative',
                    overflow: forge && forge.tier !== 'empty' ? 'visible' : undefined,
                    cursor: forge && forge.tier !== 'empty' ? 'pointer' : isPassable ? 'inherit' : 'not-allowed',
                    boxShadow: forge?.tier === 'mine' ? '0 0 8px #f59e0b88 inset' : undefined,
                  }}
                >
                  {!forge && TERRAIN_ICON[terrain] && (
                    <span style={{ opacity: 0.75, pointerEvents: 'none' }}>{TERRAIN_ICON[terrain]}</span>
                  )}
                  {forge && forge.tier !== 'empty' && (
                    <TowerMarker tier={forge.tier === 'mine' ? 'mine' : 'neutral'} />
                  )}
                  {forge && forge.tier === 'empty' && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,200,100,0.25)', border: '1px solid rgba(255,200,100,0.4)' }} />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Legend — collapsible */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,0.75)', border: '1px solid #2d4a2d',
          borderRadius: 8, fontSize: 10, color: '#a0b8a0',
          backdropFilter: 'blur(4px)', overflow: 'hidden', minWidth: 80,
        }}>
          <button onClick={() => setLegendOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#a0c8a0', fontSize: 10, fontWeight: 700 }}>
            <span>LEGEND</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{legendOpen ? '▲' : '▼'}</span>
          </button>
          {legendOpen && (
            <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(['grass', 'water', 'forest', 'hills', 'mountains', 'desert', 'lava'] as TerrainType[]).map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: TERRAIN_BG[t], border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                  <span style={{ textTransform: 'capitalize' }}>{t}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #2d4a2d', paddingTop: 6, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([['mine', 'Your forge'], ['neutral', 'Claimed'], ['empty', 'Available']] as const).map(([tier, label]) => (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: FORGE_COLOR[tier], border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Minimap */}
        <div className="absolute bottom-3 right-3 hidden sm:block"
          style={{ border: '1px solid #2d4a2d', borderRadius: 6, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <canvas ref={miniRef} width={140} height={116} />
        </div>

        {/* Forge popup */}
        {selected && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16, paddingLeft: 16, paddingRight: 16, pointerEvents: 'none', zIndex: 20 }}>
            <div
              style={{ background: '#0f1a0f', border: '1px solid #3d6231', borderRadius: 16, padding: 20, maxWidth: 320, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', pointerEvents: 'auto' }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
              <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: 18, marginBottom: 2 }}>⚒ Forge #{selected.plotId}</div>
              <div style={{ color: '#4a6a4a', fontSize: 10, fontFamily: 'monospace', marginBottom: 12, wordBreak: 'break-all' }}>{selected.owner}</div>
              {selected.inscription && (
                <div style={{ background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#a0b870', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 12 }}>
                  {selected.inscription}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/foundry/forge/${selected.plotId}`}
                  style={{ flex: 1, textAlign: 'center', background: 'linear-gradient(135deg,#b45309,#78350f)', border: '1px solid #f59e0b44', color: '#fde68a', fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '8px 0', textDecoration: 'none' }}>
                  View Forge
                </Link>
                <button onClick={() => setSelected(null)}
                  style={{ flex: 1, background: '#1a2a1a', border: '1px solid #2d4a2d', color: '#6b9e6b', fontSize: 12, borderRadius: 10, padding: '8px 0', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <GameNav forgeId={myForge?.plotId ?? null} />

      <style>{`
        @keyframes forge-glow {
          0%, 100% { box-shadow: 0 0 5px #fbbf2466; }
          50% { box-shadow: 0 0 14px #fbbf24; }
        }
      `}</style>
    </div>
  );
}
