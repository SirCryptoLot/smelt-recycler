// app/api/admin/donations/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { loadDonations } from '@/lib/donations';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = loadDonations();
  const totalSolDonated = entries.reduce((s, e) => s + e.solDonated, 0);

  return NextResponse.json({
    totalSolDonated,
    donationCount: entries.length,
    entries,
  });
}
