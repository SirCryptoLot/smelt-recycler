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
