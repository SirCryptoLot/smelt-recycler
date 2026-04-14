// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
import { AppShell } from '@/components/AppShell';
import { SmeltProvider } from '@/lib/smelt-context';
import { Suspense } from 'react';
import { ReferralDetector } from '@/components/ReferralDetector';

export const metadata: Metadata = {
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
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
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
