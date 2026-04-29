// app/api/foundry/process-attacks/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { resolvePendingAttacks } from '@/lib/foundry-combat';

export const dynamic = 'force-dynamic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const resolved = resolvePendingAttacks();
  return NextResponse.json({ resolved });
}
