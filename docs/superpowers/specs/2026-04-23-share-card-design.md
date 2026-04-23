# Share Card — Design Spec
**Date:** 2026-04-23
**Status:** Approved

---

## Overview

A viral share card feature. Each wallet gets a public URL (`/card/[wallet]`) that renders their recycling stats as a visual card and sets the correct OG meta tags so the card image appears automatically when the link is pasted into Twitter/X, Telegram, or Discord.

The card image itself is generated server-side by a route (`/api/share-card?wallet=X`) that returns a PNG using Next.js `ImageResponse` (`@vercel/og`).

---

## User Flow

1. User visits their Dashboard (connected wallet).
2. If they have at least 1 recycled account, a **"Share your stats"** button appears below the Activity section.
3. Clicking it navigates to `/card/[wallet-address]`.
4. The `/card/` page shows the rendered card, a **Copy link** button, and a **Share on X** button.
5. When the user copies and pastes the link anywhere (X, Telegram, Discord), the platform fetches the OG image from `/api/share-card?wallet=X` and displays it as a rich preview.

Anyone can also navigate directly to `/card/[any-wallet]` — no wallet connection required to view a card.

---

## Card Visual Spec

**Dimensions:** 1200 × 630 px (standard OG image size, works on all major platforms)

**Background:** Dark green-black (`#0a1a12`)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [Logo: im/logo.png, 72px]      5gGqU2…HK5          │  ← row 1: logo + wallet
│                                                      │
│              47                                      │
│        accounts recycled      ┌─ Rank #4 ─┐         │  ← hero stat + rank pill
│                                └──────────┘         │
│                                                      │
│   0.0940 SOL reclaimed  ·  11,750 SMELT earned       │  ← secondary stats row
│                                                      │
│   ♻ Cleaning Solana, one wallet at a time            │  ← tagline
│                                    smelt-recycler.app│  ← domain (bottom right)
└─────────────────────────────────────────────────────┘
```

**Typography:**
- Hero number (accounts): 96px, extrabold, white
- "accounts recycled" label: 20px, medium, `#6ee7b7` (green-300)
- Secondary stats: 24px, semibold, `#d1fae5` (green-100)
- Rank pill: 18px, bold, white text on `#16a34a` (green-600) background, rounded-full
- Tagline: 18px, regular, `#4ade80` (green-400)
- Domain: 14px, `#4ade80`, bottom-right
- Wallet address: 14px monospace, `#6ee7b7`, top-right

**Logo:** `/public/logo.png` (copied from `/im/logo.png`), displayed at 72×72px top-left. White/light version not needed — the logo is dark-background-friendly as-is.

**If rank is null** (wallet not in top 20 this week): rank pill is omitted entirely.
**If stat is 0**: the card still renders but secondary stats show `—` instead of 0.

---

## Route: `/api/share-card`

**File:** `app/api/share-card/route.ts`
**Method:** GET
**Query param:** `wallet` (base58 address, required)
**Returns:** `ImageResponse` (PNG, 1200×630)
**Runtime:** Node.js (`export const runtime = 'nodejs'`)
**Caching:** `Cache-Control: public, max-age=300, stale-while-revalidate=3600` (5-minute freshness, 1-hour stale serve)

**Data fetched inside the route (server-side):**
1. `getWalletStats(wallet)` from `lib/leaderboard` — provides `allTimeAccounts`, `allTimeSolReclaimed`, `allTimeSmeltEarned`
2. `getWeeklyRank(wallet)` from `lib/leaderboard` — provides weekly rank integer (1-based) or -1 if not ranked

Both are synchronous reads from local JSON files — no external HTTP calls needed inside this route.

**Error handling:**
- Invalid/missing wallet param → returns a fallback "Connect your wallet" card (same design, no stats)
- Any render error → returns a plain green card with logo only (never a 500)

---

## Page: `/card/[wallet]`

**File:** `app/card/[wallet]/page.tsx`
**Server component** (uses `generateMetadata` for OG tags)

**`generateMetadata`** sets:
```
og:title    = "wallet recycled X accounts on SMELT Recycler"
og:image    = /api/share-card?wallet=[wallet]
og:image:width  = 1200
og:image:height = 630
twitter:card    = summary_large_image
```

**Page body (client component section):**
- Shows the card as a `<img src="/api/share-card?wallet=X" />` at responsive max-width
- **Copy link** button — copies `https://[domain]/card/[wallet]` to clipboard, shows "Copied!" confirmation
- **Share on X** button — opens `https://twitter.com/intent/tweet?text=...&url=...` in new tab. Pre-composed text: *"Just cleaned my Solana wallet on @SmeltRecycler ♻ {X} accounts recycled · {Y} SOL reclaimed · {Z} SMELT earned"*
- **"Recycle your wallet"** CTA button → links to `/`
- No wallet connection required to view the page

---

## Dashboard Integration

**File:** `app/dashboard/page.tsx`

Below the Activity section, when `allTimeAccounts > 0`:
```
┌─────────────────────────────────┐
│ 🎉 Share your stats             │
│ Show the world your impact  [→] │
└─────────────────────────────────┘
```
A green-tinted banner/card with a link to `/card/[publicKey]`. Non-intrusive — only shown when there's something worth sharing.

---

## Files

| File | Change |
|---|---|
| `app/api/share-card/route.ts` | **Create** — PNG image route |
| `app/card/[wallet]/page.tsx` | **Create** — OG page + share UI |
| `app/dashboard/page.tsx` | **Modify** — add share banner below Activity |
| `public/logo.png` | **Copy** from `im/logo.png` |

**New dependency:** `@vercel/og` (provides `ImageResponse`)

---

## Out of Scope

- Animated cards
- Custom card themes / color picker
- Card for NFT burn stats (can be added later)
- Email share
