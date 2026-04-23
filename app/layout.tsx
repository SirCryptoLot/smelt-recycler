// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';
import { SmeltProvider } from '@/lib/smelt-context';
import { Suspense } from 'react';
import { ReferralDetector } from '@/components/ReferralDetector';

const rubik = Rubik({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-rubik' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://smelt-recycler.app'),
  title: '♻ Recycler',
  description: 'Reclaim your SOL from dust accounts',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rubik.variable}>
      <body className={rubik.className}>
        <Providers>
          <SmeltProvider>
            <Suspense fallback={null}>
              <ReferralDetector />
            </Suspense>
            <AppShell>{children}</AppShell>
          </SmeltProvider>
        </Providers>
      </body>
    </html>
  );
}
