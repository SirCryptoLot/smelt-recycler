// app/api/admin/referrals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAllReferralStats } from '../../../../lib/referrals';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getAllReferralStats());
}
