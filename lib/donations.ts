// lib/donations.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

export interface DonationEntry {
  date: string;
  wallet: string;
  solDonated: number;
  pct: number;
  txSignature: string;
  distributed?: boolean;
}

const DONATIONS_PATH = path.join(DATA_DIR, 'donations.json');

export function loadDonations(): DonationEntry[] {
  if (!fs.existsSync(DONATIONS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf-8')) as DonationEntry[];
  } catch {
    return [];
  }
}

export function appendDonation(entry: DonationEntry): void {
  try {
    const existing = loadDonations();
    existing.push(entry);
    fs.writeFileSync(DONATIONS_PATH, JSON.stringify(existing, null, 2));
  } catch { /* non-blocking */ }
}

export function getDonationTotals(): { totalSolDonated: number; donationCount: number } {
  const entries = loadDonations();
  return {
    totalSolDonated: entries.reduce((s, e) => s + e.solDonated, 0),
    donationCount: entries.length,
  };
}
