// components/ReferralDetector.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReferralDetector() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    // Never overwrite an existing referrer
    if (localStorage.getItem('referredBy')) return;

    void (async () => {
      if (ref.length <= 10) {
        // Short code — resolve to full wallet via API
        try {
          const res = await fetch(`/api/referral?code=${encodeURIComponent(ref)}`);
          if (!res.ok) return;
          const d = await res.json() as { wallet?: string };
          if (d.wallet) localStorage.setItem('referredBy', d.wallet);
        } catch { /* ignore */ }
      } else {
        // Full pubkey (legacy / direct share)
        localStorage.setItem('referredBy', ref);
      }
    })();
  }, [searchParams]);

  return null;
}
