// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';
import { SmeltProvider } from '@/lib/smelt-context';

export const metadata: Metadata = {
  title: '♻ Recycler',
  description: 'Reclaim your SOL from dust accounts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SmeltProvider>
            <AppShell>{children}</AppShell>
          </SmeltProvider>
        </Providers>
      </body>
    </html>
  );
}
