// lib/referrals.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'referrals.json');

export interface ReferralEvent {
  referee: string;
  accountsClosed: number;
  solReclaimed: number;
  bonusEarned: number;
  date: string;
}

export interface ReferralsData {
  relationships: Record<string, ReferralEvent[]>;
  pendingBonuses: Record<string, number>;
}

function load(): ReferralsData {
  try {
    if (!fs.existsSync(PATH)) return { relationships: {}, pendingBonuses: {} };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as ReferralsData;
  } catch {
    return { relationships: {}, pendingBonuses: {} };
  }
}

function save(data: ReferralsData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

export function recordReferral(referrer: string, referee: string, accountsClosed: number, solReclaimed: number): void {
  const bonusEarned = solReclaimed * 0.05 * 0.1;
  const data = load();

  if (!data.relationships[referrer]) data.relationships[referrer] = [];
  data.relationships[referrer].push({
    referee,
    accountsClosed,
    solReclaimed,
    bonusEarned,
    date: new Date().toISOString(),
  });

  data.pendingBonuses[referrer] = (data.pendingBonuses[referrer] ?? 0) + bonusEarned;
  save(data);
}

export function getReferralStats(wallet: string): {
  referrals: ReferralEvent[];
  pendingBonus: number;
  totalEarned: number;
} {
  const data = load();
  const referrals = data.relationships[wallet] ?? [];
  const pendingBonus = data.pendingBonuses[wallet] ?? 0;
  const totalEarned = referrals.reduce((s, r) => s + r.bonusEarned, 0);
  return { referrals, pendingBonus, totalEarned };
}
