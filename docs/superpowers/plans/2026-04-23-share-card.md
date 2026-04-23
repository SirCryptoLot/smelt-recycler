# Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a shareable 1200×630 PNG card per wallet showing recycling stats, served at `/api/share-card?wallet=X`, with a public page at `/card/[wallet]` that sets OG meta tags so the card auto-previews on Twitter/X, Telegram, and Discord.

**Architecture:** A Next.js route handler renders JSX to PNG via `next/og`'s `ImageResponse`. A server-component page at `/card/[wallet]` calls `generateMetadata` to set OG tags, reads stats directly from the leaderboard JSON (synchronous file reads — no HTTP), and renders a client `ShareButtons` component for copy/tweet actions. The Dashboard gets a non-intrusive share banner linking to the card page.

**Tech Stack:** Next.js 14 `ImageResponse` (`next/og`), React server components, Tailwind CSS (page only — card uses inline styles required by satori)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `public/logo.png` | Create (copy) | Logo asset served statically |
| `app/api/share-card/route.ts` | Create | Returns 1200×630 PNG via ImageResponse |
| `app/card/[wallet]/page.tsx` | Create | Server component: generateMetadata + card display |
| `app/card/[wallet]/ShareButtons.tsx` | Create | Client component: copy link + tweet buttons |
| `app/dashboard/page.tsx` | Modify | Add share banner below Activity section |

---

## Task 1: Copy logo asset

**Files:**
- Create: `public/logo.png`

- [ ] **Step 1: Copy the logo**

```bash
cp /c/recycle/im/logo.png /c/recycle/public/logo.png
```

- [ ] **Step 2: Verify it's accessible**

Start dev server (`npm run dev`) and open `http://localhost:3000/logo.png` in the browser. You should see the Spartan warrior recycling logo.

- [ ] **Step 3: Commit**

```bash
git add public/logo.png
git commit -m "chore: add logo to public assets for share card"
```

---

## Task 2: Create the image generation route

**Files:**
- Create: `app/api/share-card/route.ts`

This route reads wallet stats synchronously from the leaderboard JSON and returns a PNG. It uses `next/og`'s `ImageResponse`. Satori (the renderer inside `ImageResponse`) requires **all layout to use flexbox** — no CSS grid, no `block` display. Every container `div` must have `display: 'flex'`.

Key leaderboard facts:
- `getWalletStats(wallet)` → `{ allTime: { accounts, solReclaimed, smeltEarned } }`
- `getWeeklyRank(wallet)` → `0` if not ranked, `1`-based integer if ranked

- [ ] **Step 1: Create the route file**

Create `app/api/share-card/route.ts` with this full content:

```typescript
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
```

- [ ] **Step 2: Smoke-test the route**

With dev server running, open:
```
http://localhost:3000/api/share-card?wallet=5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5
```
Expected: browser displays a 1200×630 dark-green PNG with the Spartan logo, hero number, and SMELT/SOL stats. If the wallet has no stats yet, the card shows `—` in the hero — that's correct.

- [ ] **Step 3: Commit**

```bash
git add app/api/share-card/route.ts
git commit -m "feat: add share-card image route (1200x630 PNG via ImageResponse)"
```

---

## Task 3: Create the card page — server component

**Files:**
- Create: `app/card/[wallet]/page.tsx`

This is a **server component** (no `'use client'`). It uses `generateMetadata` to set OG tags and reads stats server-side to pass as props to the client `ShareButtons` component.

- [ ] **Step 1: Create the page file**

Create `app/card/[wallet]/page.tsx`:

```tsx
// app/card/[wallet]/page.tsx
import { Metadata } from 'next';
import Link from 'next/link';
import { getWalletStats, getWeeklyRank } from '@/lib/leaderboard';
import ShareButtons from './ShareButtons';

interface Props {
  params: { wallet: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = params;
  const stats = getWalletStats(wallet);
  const accounts = stats.allTime.accounts;

  return {
    title: `${wallet.slice(0, 6)}…${wallet.slice(-4)} recycled ${accounts} accounts — SMELT Recycler`,
    description: `${accounts} accounts recycled · ${stats.allTime.solReclaimed.toFixed(4)} SOL reclaimed · ${stats.allTime.smeltEarned.toLocaleString()} SMELT earned`,
    openGraph: {
      title: 'SMELT Recycler — Wallet Stats',
      description: `${accounts} accounts recycled on SMELT Recycler`,
      images: [
        {
          url: `/api/share-card?wallet=${wallet}`,
          width: 1200,
          height: 630,
          alt: 'SMELT Recycler stats card',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SMELT Recycler — Wallet Stats',
      images: [`/api/share-card?wallet=${wallet}`],
    },
  };
}

export default function CardPage({ params }: Props) {
  const { wallet } = params;
  const stats     = getWalletStats(wallet);
  const rank      = getWeeklyRank(wallet);

  const accounts    = stats.allTime.accounts;
  const solReclaimed = stats.allTime.solReclaimed;
  const smeltEarned  = stats.allTime.smeltEarned;
  const cardUrl     = `/api/share-card?wallet=${wallet}`;
  const pageUrl     = `/card/${wallet}`;

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6">

      {/* Heading */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Recycling Stats</h1>
        <p className="text-gray-400 text-sm mt-1 font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</p>
      </div>

      {/* Card preview */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardUrl}
          alt="Recycling stats card"
          className="w-full"
          style={{ aspectRatio: '1200/630', display: 'block' }}
        />
      </div>

      {/* Share buttons (client component) */}
      <ShareButtons
        wallet={wallet}
        pageUrl={pageUrl}
        accounts={accounts}
        solReclaimed={solReclaimed}
        smeltEarned={smeltEarned}
        rank={rank}
      />

      {/* CTA */}
      <Link
        href="/"
        className="flex items-center justify-between rounded-2xl bg-green-50 border border-green-100 px-5 py-4 group hover:border-green-200 transition-colors"
      >
        <div>
          <div className="font-semibold text-sm text-green-800">Recycle your wallet</div>
          <div className="text-xs text-green-600 mt-0.5">Close dust accounts, get SOL back, earn SMELT</div>
        </div>
        <span className="text-green-600 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
      </Link>

    </div>
  );
}
```

- [ ] **Step 2: Verify the page loads**

Open `http://localhost:3000/card/5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5`

Expected: page renders with heading, card image displayed, and a CTA button. The ShareButtons area will be broken (not yet created) — that's expected at this step.

- [ ] **Step 3: Commit**

```bash
git add app/card/[wallet]/page.tsx
git commit -m "feat: add /card/[wallet] server page with OG metadata"
```

---

## Task 4: Create ShareButtons client component

**Files:**
- Create: `app/card/[wallet]/ShareButtons.tsx`

- [ ] **Step 1: Create the client component**

Create `app/card/[wallet]/ShareButtons.tsx`:

```tsx
// app/card/[wallet]/ShareButtons.tsx
'use client';

import { useState } from 'react';

interface Props {
  wallet: string;
  pageUrl: string;
  accounts: number;
  solReclaimed: number;
  smeltEarned: number;
  rank: number;
}

export default function ShareButtons({ wallet, pageUrl, accounts, solReclaimed, smeltEarned, rank }: Props) {
  const [copied, setCopied] = useState(false);

  // Build full URL for sharing — falls back to relative if window not available
  const fullUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${pageUrl}`
    : pageUrl;

  function handleCopy() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const rankText = rank > 0 ? ` · Rank #${rank} this week` : '';
  const tweetText = encodeURIComponent(
    `Just cleaned my Solana wallet ♻\n\n${accounts} accounts recycled · ${solReclaimed.toFixed(4)} SOL reclaimed · ${smeltEarned.toLocaleString()} SMELT earned${rankText}\n\n`
  );
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(fullUrl)}`;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Copy link */}
      <button
        onClick={handleCopy}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700">Copied!</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy link
          </>
        )}
      </button>

      {/* Share on X */}
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-black hover:bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full page works**

Open `http://localhost:3000/card/5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5`

Expected:
- Card image renders
- "Copy link" button copies `http://localhost:3000/card/5gGqU2...` to clipboard and shows "Copied!"
- "Share on X" button opens a new tab with a pre-composed tweet containing stats

- [ ] **Step 3: Commit**

```bash
git add app/card/[wallet]/ShareButtons.tsx
git commit -m "feat: add ShareButtons client component (copy link + tweet)"
```

---

## Task 5: Add share banner to Dashboard

**Files:**
- Modify: `app/dashboard/page.tsx` (insert between the Activity section closing tag and the Rewards section, around line 211)

- [ ] **Step 1: Add the Link import if not already present**

`Link` is already imported at the top of `app/dashboard/page.tsx` — no change needed.

- [ ] **Step 2: Insert share banner between Activity and Rewards sections**

In `app/dashboard/page.tsx`, find the closing of the Activity section:

```tsx
        </section>

        {/* Rewards */}
```

Replace it with:

```tsx
        </section>

        {/* Share stats banner — only shown when user has recycled at least once */}
        {!loading && (data?.activity.allTimeAccounts ?? 0) > 0 && (
          <Link
            href={`/card/${publicKey.toBase58()}`}
            className="flex items-center justify-between rounded-2xl border border-green-100 bg-green-50 px-4 py-3 group hover:border-green-200 transition-colors"
          >
            <div>
              <div className="text-sm font-semibold text-green-800">Share your recycling stats</div>
              <div className="text-xs text-green-600 mt-0.5">Generate a card to share on X, Telegram &amp; Discord</div>
            </div>
            <span className="text-green-600 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
          </Link>
        )}

        {/* Rewards */}
```

- [ ] **Step 3: Verify banner appears on dashboard**

Connect a wallet that has recycled at least one account and visit `/dashboard`. Expected: a green banner appears between Activity and Rewards sections. Clicking it navigates to `/card/[wallet]`.

If the wallet has 0 recycled accounts, the banner should not appear.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add share stats banner to dashboard (links to /card/[wallet])"
```

---

## Task 6: End-to-end test

- [ ] **Step 1: Test the full OG flow**

Use a tool like [opengraph.xyz](https://www.opengraph.xyz) or Twitter's Card Validator with the URL:
```
http://localhost:3000/card/5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5
```
(For local testing, use ngrok or a tunnel to expose localhost. For production, deploy and test with the real URL.)

Expected: card preview image appears with stats, correct `og:title`, `twitter:card: summary_large_image`.

- [ ] **Step 2: Test blank card (wallet with no stats)**

Open: `http://localhost:3000/api/share-card?wallet=11111111111111111111111111111111`

Expected: card renders with `—` in the hero number, no rank pill, `—` in secondary stats. No 500 error.

- [ ] **Step 3: Test missing wallet param**

Open: `http://localhost:3000/api/share-card`

Expected: card renders with blank/empty stats. No 500 error.

- [ ] **Step 4: Final commit**

```bash
git add -A  # should be nothing left unstaged
git push origin master
```

---

## Self-Review Notes

- `getWeeklyRank` returns `0` when not ranked — correctly handled (`rank > 0` guard on pill)
- `next/og` is built into Next.js 14 — no extra `package.json` dependency needed
- `generateMetadata` OG image URL is relative (`/api/share-card?wallet=X`) — Next.js resolves it against `metadataBase`. If the app is deployed under a custom domain, set `NEXT_PUBLIC_BASE_URL` and add `metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL)` to the root `app/layout.tsx` for fully absolute OG URLs.
- Satori constraint: all containers use `display: 'flex'` — verified in route code
- Logo read via `fs.readFileSync` in Node runtime — works because `export const runtime = 'nodejs'` is set
