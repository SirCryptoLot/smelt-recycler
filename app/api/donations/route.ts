export const dynamic = 'force-dynamic';
// app/api/donations/route.ts
import { NextResponse } from 'next/server';
import { getDonationTotals, loadDonations } from '@/lib/donations';

export async function GET(): Promise<NextResponse> {
  try {
    const totals = getDonationTotals();
    const all = loadDonations();
    const entries = [...all].reverse().slice(0, 10);
    return NextResponse.json({ ...totals, entries });
  } catch {
    return NextResponse.json({ totalSolDonated: 0, donationCount: 0, entries: [] });
  }
}
