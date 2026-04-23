// app/api/share-card/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import * as fs from 'fs';
import * as path from 'path';
import { getWalletStats, getWeeklyRank } from '@/lib/leaderboard';

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') ?? '';

  let accounts = 0;
  let solReclaimed = 0;
  let smeltEarned = 0;
  let rank = 0;

  if (wallet.length > 10) {
    try {
      const stats = getWalletStats(wallet);
      accounts     = stats.allTime.accounts;
      solReclaimed = stats.allTime.solReclaimed;
      smeltEarned  = stats.allTime.smeltEarned;
      rank         = getWeeklyRank(wallet); // 0 = not ranked, else 1-based
    } catch { /* return blank card */ }
  }

  // Read logo as base64 data URL (works in Node runtime, no HTTP needed)
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png'));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const hasStats = accounts > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          backgroundColor: '#0a1a12',
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 64px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Row 1: Logo left, wallet address right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={80} height={80} style={{ objectFit: 'contain' }} alt="logo" />
          {wallet && (
            <span style={{ color: '#6ee7b7', fontSize: '16px', fontFamily: 'monospace' }}>
              {shortAddr(wallet)}
            </span>
          )}
        </div>

        {/* Hero: accounts recycled + rank pill */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '48px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <span style={{ color: '#ffffff', fontSize: '100px', fontWeight: 800, lineHeight: 1, letterSpacing: '-2px' }}>
              {hasStats ? accounts : '—'}
            </span>
            {rank > 0 && (
              <div style={{
                backgroundColor: '#16a34a',
                borderRadius: '9999px',
                padding: '10px 24px',
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'center',
              }}>
                <span style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700 }}>
                  Rank #{rank}
                </span>
              </div>
            )}
          </div>
          <span style={{ color: '#6ee7b7', fontSize: '22px', fontWeight: 500, marginTop: '10px' }}>
            accounts recycled
          </span>

          {/* Secondary stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '36px' }}>
            <span style={{ color: '#d1fae5', fontSize: '26px', fontWeight: 600 }}>
              {hasStats ? `${solReclaimed.toFixed(4)} SOL reclaimed` : '—'}
            </span>
            <span style={{ color: '#4ade80', fontSize: '26px' }}>·</span>
            <span style={{ color: '#d1fae5', fontSize: '26px', fontWeight: 600 }}>
              {hasStats ? `${smeltEarned.toLocaleString('en-US')} SMELT earned` : '—'}
            </span>
          </div>
        </div>

        {/* Footer: tagline left, domain right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ color: '#4ade80', fontSize: '18px' }}>
            ♻ Cleaning Solana, one wallet at a time
          </span>
          <span style={{ color: '#4ade80', fontSize: '14px', opacity: 0.7 }}>
            smelt-recycler.app
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
