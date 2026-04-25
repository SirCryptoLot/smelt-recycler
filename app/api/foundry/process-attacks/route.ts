// app/api/foundry/process-attacks/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getPlotPosition, getTileAt } from '@/lib/foundry-map';
import { getForgeBuildings, saveForgeBuildings } from '@/lib/foundry-buildings';
import { getForgeTroops, saveForgeTroops, emptyTroopCount } from '@/lib/foundry-troops';
import {
  getPendingAttacks, saveAttack,
  calcAttackPower, calcDefPower,
  calcTroopLosses, subtractTroops, addTroops,
  AttackRecord,
} from '@/lib/foundry-combat';

export const dynamic = 'force-dynamic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const arrived = getPendingAttacks().filter(r => new Date(r.arrivesAt) <= now);

  const results: { id: string; outcome: string; ingotStolen: number }[] = [];
  for (const attack of arrived) {
    try {
      const resolved = resolveBattle(attack);
      saveAttack(resolved);
      results.push({ id: resolved.id, outcome: resolved.outcome!, ingotStolen: resolved.ingotStolen });
    } catch (err) {
      console.error('[process-attacks] failed to resolve', attack.id, err);
    }
  }

  return NextResponse.json({ resolved: results.length, results });
}

function resolveBattle(attack: AttackRecord): AttackRecord {
  // Determine defender terrain
  const defPos = getPlotPosition(attack.defenderForgeId);
  const terrain = defPos ? (getTileAt(defPos.row, defPos.col) ?? 'grass') : 'grass';

  // Load both forges
  const defBuildings = getForgeBuildings(attack.defenderForgeId);
  const defTroops    = getForgeTroops(attack.defenderForgeId);
  const atkBuildings = getForgeBuildings(attack.attackerForgeId);
  const atkTroops    = getForgeTroops(attack.attackerForgeId);

  const rampartLevel   = defBuildings.levels['rampart'];
  const vaultLevel     = defBuildings.levels['vault_storage'];
  const vaultProtected = vaultLevel * 2_000;

  const atkPower = calcAttackPower(attack.sentTroops);
  const defPower = calcDefPower(defTroops.stationed, rampartLevel, terrain);

  let ingotStolen = 0;
  let outcome: 'attacker_wins' | 'defender_wins';
  let attackerLosses = emptyTroopCount();
  let defenderLosses = emptyTroopCount();

  if (atkPower > defPower) {
    // ── Attacker wins ───────────────────────────────────────────────────────
    outcome = 'attacker_wins';

    ingotStolen = Math.floor(Math.max(0, defBuildings.ingotBalance - vaultProtected) * 0.25);

    // Defender loses 100%
    defenderLosses = { ...defTroops.stationed };
    defTroops.stationed = emptyTroopCount();

    // Attacker loses floor((DEF/ATK) * 60%) of each sent type
    const atkLossFrac = atkPower > 0 ? (defPower / atkPower) * 0.6 : 0;
    attackerLosses = calcTroopLosses(attack.sentTroops, atkLossFrac);

    // Surviving attacker troops return home
    const surviving = subtractTroops(attack.sentTroops, attackerLosses);
    atkTroops.stationed = addTroops(atkTroops.stationed, surviving);

    // Transfer Ingots
    defBuildings.ingotBalance = Math.max(0, defBuildings.ingotBalance - ingotStolen);
    atkBuildings.ingotBalance = atkBuildings.ingotBalance + ingotStolen;

  } else {
    // ── Defender wins ───────────────────────────────────────────────────────
    outcome = 'defender_wins';

    // Attacker loses all sent troops (already deducted on send, no return)
    attackerLosses = { ...attack.sentTroops };

    // Defender loses floor((ATK/DEF) * 40%) of stationed
    const defLossFrac = defPower > 0 ? (atkPower / defPower) * 0.4 : 0;
    defenderLosses = calcTroopLosses(defTroops.stationed, defLossFrac);
    defTroops.stationed = subtractTroops(defTroops.stationed, defenderLosses);
  }

  // Persist all changes
  saveForgeBuildings(defBuildings);
  saveForgeTroops(defTroops);
  saveForgeBuildings(atkBuildings);
  saveForgeTroops(atkTroops);

  return {
    ...attack,
    resolvedAt: new Date().toISOString(),
    outcome,
    ingotStolen,
    attackerLosses,
    defenderLosses,
  };
}
