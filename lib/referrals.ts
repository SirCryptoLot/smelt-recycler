// lib/referrals.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'referrals.json');
// No I/O and no confusable chars (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface ReferralEvent {
  referee: string;
  accountsClosed: number;
  solReclaimed: number;
  bonusEarned: number;   // SOL — paid out via cron
  smeltBonus: number;    // SMELT — minted immediately at recycle time
  date: string;
}

export interface ReferralsData {
  codes: Record<string, string>;        // code → wallet
  walletCodes: Record<string, string>;  // wallet → code
  relationships: Record<string, ReferralEvent[]>;
  pendingBonuses: Record<string, number>;  // wallet → SOL owed
}

function load(): ReferralsData {
  const empty: ReferralsData = { codes: {}, walletCodes: {}, relationships: {}, pendingBonuses: {} };
  try {
    if (!fs.existsSync(PATH)) return empty;
    const raw = JSON.parse(fs.readFileSync(PATH, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
    return {
      codes:          raw.codes          ?? {},
      walletCodes:    raw.walletCodes    ?? {},
      relationships:  raw.relationships  ?? {},
      pendingBonuses: raw.pendingBonuses ?? {},
    };
  } catch {
    return empty;
  }
}

function save(data: ReferralsData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Returns existing code for wallet, or creates a new unique one. */
export function getOrCreateCode(wallet: string): string {
  const data = load();
  if (data.walletCodes[wallet]) return data.walletCodes[wallet];
  let code = generateCode();
  while (data.codes[code]) code = generateCode(); // retry on collision
  data.codes[code] = wallet;
  data.walletCodes[wallet] = code;
  save(data);
  return code;
}

/** Resolves a 5-char code to a wallet address, or null if not found. */
export function walletForCode(code: string): string | null {
  const data = load();
  return data.codes[code.toUpperCase()] ?? null;
}

/**
 * Records a referral event. First-recycle-only — if this referee was already
 * credited to any referrer, the call is a no-op.
 *
 * SOL bonus = 1% of SOL reclaimed by referee (paid out via cron)
 * SMELT bonus = 20% of SMELT referee earned (caller must mint this immediately)
 *
 * Returns the smeltBonus so the caller can mint it.
 */
export function recordReferral(
  referrer: string,
  referee: string,
  accountsClosed: number,
  solReclaimed: number,
  smeltMinted: number,
): number {
  const data = load();

  // First-recycle-only: check across all referrers
  const alreadyCredited = Object.values(data.relationships).some(events =>
    events.some(e => e.referee === referee)
  );
  if (alreadyCredited) return 0;

  const bonusEarned = solReclaimed * 0.01;           // 1% of SOL reclaimed
  const smeltBonus  = Math.floor(smeltMinted * 0.2); // 20% of referee's SMELT

  if (!data.relationships[referrer]) data.relationships[referrer] = [];
  data.relationships[referrer].push({
    referee,
    accountsClosed,
    solReclaimed,
    bonusEarned,
    smeltBonus,
    date: new Date().toISOString(),
  });

  data.pendingBonuses[referrer] = (data.pendingBonuses[referrer] ?? 0) + bonusEarned;
  save(data);
  return smeltBonus;
}

export function getReferralStats(wallet: string): {
  referrals: ReferralEvent[];
  pendingBonus: number;
  totalEarned: number;
  code: string;
} {
  const data = load();
  const referrals   = data.relationships[wallet] ?? [];
  const pendingBonus = data.pendingBonuses[wallet] ?? 0;
  const totalEarned  = referrals.reduce((s, r) => s + r.bonusEarned, 0);
  const code         = getOrCreateCode(wallet);
  return { referrals, pendingBonus, totalEarned, code };
}

export interface ReferrerSummary {
  wallet: string;
  count: number;
  pendingSOL: number;
  totalEarned: number;
  code: string;
}

export function getAllReferralStats(): {
  totalReferralEvents: number;
  uniqueReferrers: number;
  totalPendingSOL: number;
  topReferrers: ReferrerSummary[];
} {
  const data = load();
  const referrerWallets = Object.keys(data.relationships);

  const topReferrers: ReferrerSummary[] = referrerWallets.map(wallet => ({
    wallet,
    count:       data.relationships[wallet].length,
    pendingSOL:  data.pendingBonuses[wallet] ?? 0,
    totalEarned: data.relationships[wallet].reduce((s, e) => s + e.bonusEarned, 0),
    code:        data.walletCodes[wallet] ?? '—',
  })).sort((a, b) => b.count - a.count).slice(0, 50);

  return {
    totalReferralEvents: Object.values(data.relationships).reduce((s, ev) => s + ev.length, 0),
    uniqueReferrers:     referrerWallets.length,
    totalPendingSOL:     Object.values(data.pendingBonuses).reduce((s, v) => s + v, 0),
    topReferrers,
  };
}

/** Called by cron after successful payout to clear settled bonuses. */
export function clearPendingBonuses(wallets: string[]): void {
  const data = load();
  for (const wallet of wallets) {
    delete data.pendingBonuses[wallet];
  }
  save(data);
}

export function getPendingBonuses(): Record<string, number> {
  return load().pendingBonuses;
}
