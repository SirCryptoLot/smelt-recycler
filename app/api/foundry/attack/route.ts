// app/api/foundry/attack/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlots } from '@/lib/foundry';
import { getForgeBuildings } from '@/lib/foundry-buildings';
import { getForgeTroops, saveForgeTroops, TroopCount, emptyTroopCount } from '@/lib/foundry-troops';
import { plotDistance } from '@/lib/foundry-map';
import {
  AttackRecord, makeAttackId, saveAttack,
  subtractTroops, totalTroops,
} from '@/lib/foundry-combat';

export const dynamic = 'force-dynamic';

function travelMins(distance: number, barracksLevel: number): number {
  return Math.max(1, distance * 3 - barracksLevel * 0.5);
}

function attackRange(rallyLevel: number): number {
  return rallyLevel >= 5 ? Infinity : 4 + rallyLevel * 4;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      attackerForgeId: number;
      defenderForgeId: number;
      troops: TroopCount;
      wallet: string;
    };
    const { attackerForgeId, defenderForgeId, troops, wallet } = body;

    if (!attackerForgeId || !defenderForgeId || !troops || !wallet) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (attackerForgeId === defenderForgeId) {
      return NextResponse.json({ error: 'Cannot attack your own forge' }, { status: 400 });
    }

    // Verify ownership
    const plots = getPlots();
    const atkPlot = plots.find(p => p.id === attackerForgeId);
    if (!atkPlot || atkPlot.owner !== wallet) {
      return NextResponse.json({ error: 'Not the forge owner' }, { status: 403 });
    }
    const defPlot = plots.find(p => p.id === defenderForgeId);
    if (!defPlot) {
      return NextResponse.json({ error: 'Target forge not found' }, { status: 404 });
    }

    // Check rally point
    const buildings = getForgeBuildings(attackerForgeId);
    const rallyLevel = buildings.levels['rally_point'];
    if (rallyLevel < 1) {
      return NextResponse.json({ error: 'Build a Rally Point (Lv 1) first' }, { status: 400 });
    }

    // Check range
    const distance = plotDistance(attackerForgeId, defenderForgeId);
    const range = attackRange(rallyLevel);
    if (distance > range) {
      return NextResponse.json({
        error: `Target out of range (${Math.round(distance)} tiles, max ${range})`,
      }, { status: 400 });
    }

    // Check troops sent >= 1
    if (totalTroops(troops) < 1) {
      return NextResponse.json({ error: 'Must send at least 1 troop' }, { status: 400 });
    }

    // Verify enough stationed and keep >= 1 home
    const ft = getForgeTroops(attackerForgeId);
    if (
      troops.smelters    > ft.stationed.smelters    ||
      troops.ash_archers > ft.stationed.ash_archers ||
      troops.iron_guards > ft.stationed.iron_guards
    ) {
      return NextResponse.json({ error: 'Not enough troops' }, { status: 400 });
    }
    const afterSend = subtractTroops(ft.stationed, troops);
    if (totalTroops(afterSend) < 1) {
      return NextResponse.json({ error: 'Must keep at least 1 troop at home' }, { status: 400 });
    }

    // Deduct troops immediately (they are "in the field")
    ft.stationed = afterSend;
    saveForgeTroops(ft);

    // Calculate travel time and arrival
    const barracksLevel = buildings.levels['barracks'];
    const mins = travelMins(distance, barracksLevel);
    const arrivesAt = new Date(Date.now() + mins * 60_000).toISOString();

    const record: AttackRecord = {
      id: makeAttackId(),
      attackerForgeId,
      defenderForgeId,
      sentTroops: troops,
      arrivesAt,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      outcome: null,
      ingotStolen: 0,
      attackerLosses: emptyTroopCount(),
      defenderLosses: emptyTroopCount(),
    };
    saveAttack(record);

    return NextResponse.json({
      success: true,
      id: record.id,
      arrivesAt,
      distanceTiles: Math.round(distance),
      travelMins: Math.round(mins),
    });
  } catch (err) {
    console.error('[foundry/attack]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
