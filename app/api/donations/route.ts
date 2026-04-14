// app/api/donations/route.ts
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface DonationEntry {
  date: string;
  wallet: string;
  solDonated: number;
  pct: number;
  txSignature: string;
}

const DONATIONS_PATH = path.join(process.cwd(), 'data/donations.json');

export async function GET(): Promise<NextResponse> {
  try {
    const entries: DonationEntry[] = fs.existsSync(DONATIONS_PATH)
      ? JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf-8')) as DonationEntry[]
      : [];
    const totalSolDonated = entries.reduce((s, e) => s + e.solDonated, 0);
    return NextResponse.json({ totalSolDonated, donationCount: entries.length });
  } catch {
    return NextResponse.json({ totalSolDonated: 0, donationCount: 0 });
  }
}
