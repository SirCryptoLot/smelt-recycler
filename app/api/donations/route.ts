export const dynamic = 'force-dynamic';
// app/api/donations/route.ts
import { NextResponse } from 'next/server';
import { getDonationTotals } from '@/lib/donations';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(getDonationTotals());
  } catch {
    return NextResponse.json({ totalSolDonated: 0, donationCount: 0 });
  }
}
