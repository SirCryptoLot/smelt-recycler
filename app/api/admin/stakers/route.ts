// app/api/admin/stakers/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { loadPool } from '@/lib/staking-pool';
import { COOLDOWN_DAYS } from '@/lib/constants';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = loadPool();
  const totalStakedRaw = BigInt(pool.totalSmeltStaked);
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const stakers = Object.entries(pool.stakes)
    .map(([wallet, record]) => {
      const stakedRaw = BigInt(record.smeltStaked);
      const stakedUi = Number(stakedRaw) / 1e9;
      const sharePct = totalStakedRaw > 0n
        ? Number(stakedRaw * 10000n / totalStakedRaw) / 100
        : 0;
      let status: 'active' | 'cooldown' | 'ready_to_unstake';
      if (!record.cooldownStartedAt) {
        status = 'active';
      } else {
        const elapsed = now - new Date(record.cooldownStartedAt).getTime();
        status = elapsed >= cooldownMs ? 'ready_to_unstake' : 'cooldown';
      }
      return {
        wallet,
        stakedUi,
        sharePct,
        depositedAt: record.depositedAt,
        cooldownStartedAt: record.cooldownStartedAt,
        status,
      };
    })
    .sort((a, b) => b.stakedUi - a.stakedUi);

  return NextResponse.json({
    totalStakedUi: Number(totalStakedRaw) / 1e9,
    stakerCount: stakers.length,
    epochStart: pool.epochStart,
    stakers,
  });
}
