// app/api/foundry/exchange/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  getExchangeRate, verifyBuyTx, creditIngots, cashoutIngots, BUY_TAX_BPS,
} from '@/lib/foundry-exchange';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getExchangeRate());
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      action: 'buy' | 'cashout';
      wallet?: string;
      txSig?: string;
      smeltAmount?: number;
      ingots?: number;
    };

    const { action, wallet } = body;
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

    if (action === 'buy') {
      const { txSig, smeltAmount } = body;
      if (!txSig || !smeltAmount || smeltAmount <= 0) {
        return NextResponse.json({ error: 'Missing txSig or smeltAmount' }, { status: 400 });
      }
      const vaultPct      = 1 - BUY_TAX_BPS / 10000;
      const expectedUnits = BigInt(Math.floor(smeltAmount * vaultPct * 10 ** 6));
      await verifyBuyTx(txSig, wallet, expectedUnits);
      const newBalance = await creditIngots(wallet, smeltAmount);
      return NextResponse.json({ success: true, ingotBalance: newBalance });
    }

    if (action === 'cashout') {
      const { ingots } = body;
      if (!ingots || ingots <= 0) {
        return NextResponse.json({ error: 'Missing or invalid ingots amount' }, { status: 400 });
      }
      const sig = await cashoutIngots(wallet, ingots);
      return NextResponse.json({ success: true, txSig: sig });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
