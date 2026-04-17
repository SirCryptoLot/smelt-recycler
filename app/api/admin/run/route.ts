import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { action: string };
  if (body.action !== 'liquidate' && body.action !== 'distribute') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return new Promise((resolve) => {
    exec(
      `npm run ${body.action}`,
      { cwd: process.cwd(), timeout: 300_000 },
      (error, stdout, stderr) => {
        resolve(NextResponse.json({
          success: !error,
          output: [stdout, stderr].filter(Boolean).join('\n').trim(),
          error: error?.message ?? null,
        }));
      }
    );
  });
}
