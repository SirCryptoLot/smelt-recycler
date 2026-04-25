'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ForgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ForgeError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-red-600 font-bold text-base">Forge failed to load</h2>
        <p className="text-sm text-stone-500 font-mono bg-stone-50 rounded-lg p-3 break-all">
          {error.message || 'Unknown error'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl py-2 text-sm"
          >
            Try again
          </button>
          <Link href="/foundry"
            className="flex-1 text-center bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl py-2 text-sm">
            ← Back to map
          </Link>
        </div>
      </div>
    </div>
  );
}
