// app/foundry/forge/[id]/page.tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';

export default function ForgeDetailStub() {
  const { id } = useParams<{ id: string }>();
  return (
    <PageShell className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="text-amber-800 font-bold text-sm mb-1">⚒ Forge #{id}</div>
        <div className="text-amber-700 text-xs">
          Forge management — buildings, troops, production — coming in the next update.
        </div>
      </div>
      <Link href="/foundry" className="text-sm text-amber-600 hover:text-amber-800 underline">
        ← Back to World Map
      </Link>
    </PageShell>
  );
}
