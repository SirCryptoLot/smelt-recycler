// app/api/foundry/store/buy/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import { loadLeagueData, saveLeagueData, getOrCreateLeagueEntry } from '@/lib/foundry-leagues';
import {
  ITEM_CATALOGUE, getForgeItems, saveForgeItems, ItemId, warHornActive,
} from '@/lib/foundry-items';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { itemId, wallet, value } = await req.json() as {
      itemId: ItemId;
      wallet: string;
      value?: string; // nameplate text or banner hex color
    };

    if (!itemId || !wallet) {
      return NextResponse.json({ error: 'Missing itemId or wallet' }, { status: 400 });
    }

    const meta = ITEM_CATALOGUE[itemId];
    if (!meta) {
      return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
    }

    // Verify ownership
    const plots = getPlots();
    const plot = plots.find(p => p.owner === wallet);
    if (!plot) {
      return NextResponse.json({ error: 'No forge found for this wallet' }, { status: 403 });
    }
    const forgeId = plot.id;

    // Check SMELT balance
    const buildings = getForgeBuildings(forgeId);
    if (buildings.smeltBalance < meta.cost) {
      return NextResponse.json({
        error: `Not enough SMELT (need ${meta.cost.toLocaleString()}, have ${buildings.smeltBalance.toLocaleString()})`,
      }, { status: 400 });
    }

    // Load items
    const items = getForgeItems(forgeId);

    // Check cap
    if (meta.cap !== null) {
      const current = itemId === 'lightning_rod' ? items.lightningRods
                    : itemId === 'crystal_bellows' ? items.crystalBellows
                    : 0;
      if (current >= meta.cap) {
        return NextResponse.json({ error: `Already at maximum (${meta.cap})` }, { status: 400 });
      }
    }

    // Validate value params
    if (itemId === 'nameplate') {
      if (!value || value.trim().length === 0 || value.trim().length > 20) {
        return NextResponse.json({ error: 'Nameplate must be 1–20 characters' }, { status: 400 });
      }
    }
    if (itemId === 'banner') {
      if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        return NextResponse.json({ error: 'Banner color must be a valid hex code (#rrggbb)' }, { status: 400 });
      }
    }

    // Deduct SMELT
    buildings.smeltBalance -= meta.cost;
    saveForgeBuildings(buildings);

    // Apply item effect
    switch (itemId) {
      case 'lightning_rod':
        items.lightningRods = Math.min(3, items.lightningRods + 1);
        break;
      case 'crystal_bellows':
        items.crystalBellows += 1;
        break;
      case 'nameplate':
        items.nameplate = value!.trim().slice(0, 20);
        break;
      case 'banner':
        items.bannerColor = value!;
        break;
      case 'war_horn': {
        // Stack 7 days on top of existing expiry (or from now)
        const base = items.warHornExpiresAt && warHornActive(items)
          ? new Date(items.warHornExpiresAt)
          : new Date();
        base.setDate(base.getDate() + 7);
        items.warHornExpiresAt = base.toISOString();
        break;
      }
      case 'iron_shield': {
        items.ironShieldsBought += 1;
        // Arm the shield in the league entry
        const leagueData = loadLeagueData();
        const entry = getOrCreateLeagueEntry(forgeId, wallet);
        leagueData.entries[String(forgeId)] = { ...entry, shieldActive: true };
        saveLeagueData(leagueData);
        break;
      }
    }

    saveForgeItems(items);

    return NextResponse.json({
      success: true,
      itemId,
      smeltBalance: buildings.smeltBalance,
      items,
    });
  } catch (err) {
    console.error('[foundry/store/buy]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
