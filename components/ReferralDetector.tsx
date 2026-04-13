// components/ReferralDetector.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ReferralDetector() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    // Only store the first referrer — never overwrite
    if (!localStorage.getItem('referredBy')) {
      localStorage.setItem('referredBy', ref);
    }
  }, [searchParams]);

  return null;
}
