// app/api/foundry/store/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { ITEM_CATALOGUE, ALL_ITEMS, getForgeItems, ItemId, ItemMeta, ForgeItems } from '@/lib/foundry-items';

export const dynamic = 'force-dynamic';

export interface StoreItem extends ItemMeta {
  id: ItemId;
}

export interface StoreResponse {
  items: StoreItem[];
  forgeId: number | null;
  ownedItems: ForgeItems | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    const items: StoreItem[] = ALL_ITEMS.map(id => ({ id, ...ITEM_CATALOGUE[id] }));

    let forgeId: number | null = null;
    let ownedItems: ForgeItems | null = null;

    if (wallet) {
      const plots = getPlots();
      const plot = plots.find(p => p.owner === wallet);
      if (plot) {
        forgeId = plot.id;
        ownedItems = getForgeItems(plot.id);
      }
    }

    return NextResponse.json({ items, forgeId, ownedItems } satisfies StoreResponse);
  } catch (err) {
    console.error('[foundry/store]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
