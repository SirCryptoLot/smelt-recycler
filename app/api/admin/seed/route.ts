// app/api/admin/seed/route.ts — one-time data migration endpoint
// POST with { secret, files: { "fees.json": [...], ... } }
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../../../../lib/paths';

const ALLOWED = new Set([
  'fees.json', 'donations.json', 'referrals.json',
  'liquidations.json', 'distributions.json', 'ecosystem.json', 'leaderboard.json',
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { files?: Record<string, unknown> };
  if (!process.env.ADMIN_SECRET || req.headers.get('x-admin-secret') !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!body.files || typeof body.files !== 'object') {
    return NextResponse.json({ error: 'files object required' }, { status: 400 });
  }

  const written: string[] = [];
  for (const [filename, content] of Object.entries(body.files)) {
    if (!ALLOWED.has(filename)) continue;
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
    written.push(filename);
  }
  return NextResponse.json({ ok: true, written });
}
