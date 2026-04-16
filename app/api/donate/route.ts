export const dynamic = 'force-dynamic';
// app/api/donate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { appendDonation } from '@/lib/donations';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, amount, txSignature } = await req.json() as {
      wallet: string;
      amount: number;
      txSignature: string;
    };
    if (!wallet || !amount || amount <= 0 || !txSignature) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }
    appendDonation({
      date: new Date().toISOString(),
      wallet,
      solDonated: amount,
      pct: 0,
      txSignature,
      distributed: false,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record donation' }, { status: 500 });
  }
}
