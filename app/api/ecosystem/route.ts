export const dynamic = 'force-dynamic';
// app/api/ecosystem/route.ts
import { NextResponse } from 'next/server';
import { getEcosystem } from '../../../lib/ecosystem';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getEcosystem());
}
