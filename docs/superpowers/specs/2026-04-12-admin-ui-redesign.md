# Admin UI + App Shell Redesign
**Date:** 2026-04-12
**Status:** Approved

---

## Overview

Three parallel goals:
1. **Unified app shell** — replace the top nav bar with a persistent sidebar across all user pages
2. **Admin dashboard** — full web UI at `/admin/[secret]` for platform monitoring and actions
3. **How it Works page** — plain-language explainer for new users

---

## 1. Unified Sidebar Shell

### What changes
- Remove `components/Nav.tsx` (top tab bar)
- Create `components/AppShell.tsx` — persistent left sidebar used by all user-facing pages
- `app/layout.tsx` wraps children in `<AppShell>` instead of `<Nav>`

### Sidebar structure
```
[Brand: ♻ Recycler / Reclaim your SOL]

─ Navigation ──────────────
  ♻  Recycle         (/)
  🏊  Pools           (/pools)
  📖  How it works    (/how-it-works)

─ (flex spacer) ───────────

─ Wallet (when connected) ─
  Address: AbCd…XyZw
  SMELT balance: 250
  NAV: 0.0000 SOL/SMELT    ← new
  [Disconnect]

─ (not connected) ─────────
  [Connect Wallet button]
```

- Width: `w-52` (208px), same as current Recycle sidebar
- Background: `bg-[#09140f]`, border-right `border-white/5`
- Active link: `bg-emerald-500/15 text-emerald-400`
- Admin link NOT shown here — admin is secret URL only

### Recycle page (`app/page.tsx`)
- Remove sidebar JSX (wallet card, SOL stats, SMELT card, connect button) — these move to AppShell
- Add **stats strip** above the token list:
  - SOL to reclaim (emerald)
  - Dust value (muted)
  - SMELT reward preview: `+{selected.length × currentSmeltPerAccount()} SMELT` (emerald)
- Rest of page (token list, recycle button) unchanged

### Pools page (`app/pools/page.tsx`)
- Remove `min-h-screen` wrapper — AppShell provides the layout
- Content unchanged

---

## 2. How it Works Page (`app/how-it-works/page.tsx`)

Static content page. Sections:

1. **What is dust?** — Token accounts that hold tiny/zero balances. Each locks ~0.002 SOL as rent on-chain.
2. **How recycling works** — Step by step: scan → select → approve in Phantom → SOL returned minus 5% fee → SMELT rewarded
3. **What is SMELT?** — Platform reward token. Earned per account closed. Halves every 6 months (epoch). NAV = pending SOL pool ÷ circulating supply.
4. **The Vault** — Dust tokens sent here. When any single token accumulates >$10 USD value, it gets swapped to SOL via Jupiter and added to the distribution pool.
5. **Distributions** — Weekly: accumulated SOL (fees + liquidations) sent to all SMELT holders proportionally. Staked SMELT earns 1.5× weight.
6. **FAQ** — Is it safe? (user approves every tx in Phantom) / What's the 5% fee for? (platform + pool) / Why Jupiter? (best price routing on Solana)

---

## 3. Admin Dashboard

### Route
`app/admin/[token]/page.tsx` — dynamic route
Auth: `token` param checked against `process.env.ADMIN_SECRET` (set in `.env.local`)
If mismatch: render a plain 404-style page, no redirect that reveals the route exists

### Layout
Same sidebar pattern as AppShell but with **admin navigation** instead of user navigation:

```
[⚙ ADMIN]

  📊  Overview
  🏦  Vault
  ⚡  Actions
  🪙  SMELT
  📜  History

[last updated time]
[↻ Refresh button]
```

Width: `w-36` (144px)

### Data source
New API route: `GET /api/admin/stats`
Protected: checks `?secret=` query param against `ADMIN_SECRET`
Returns combined payload:

```ts
{
  vault: { tokens: VaultToken[], totalUsd: number },
  smelt: { supply: number, epochRate: number, nav: number },  // nav = pendingSol / supply
  fees: { totalCollected: number, undistributedSol: number, totalAccountsClosed: number },
  liquidations: { recent: LiquidationEntry[], undistributedSol: number },
  distributions: { recent: DistributionEntry[], totalSolDistributed: number, lastDistribution: DistributionEntry | null, nextDistributionDate: string | null },
  pending: { totalSol: number }
}
```

### Action runner
New API route: `POST /api/admin/run`
Body: `{ action: 'liquidate' | 'distribute', secret: string }`
Validates secret, then spawns `npm run liquidate` or `npm run distribute` as a child process
Streams combined stdout+stderr back as plain text in the JSON response
Timeout: 5 minutes

### Sections

**Overview**
- 4 stat cards: SMELT Supply / Vault Value / Pending SOL / NAV per SMELT (indigo)
- Vault token list with progress bars (compact)
- Quick action buttons (Liquidate + Distribute) linking to Actions tab

**Vault**
- Full table: mint (truncated), balance, USD value, % of $10 threshold, progress bar
- Badge: `READY TO SWAP` when usdValue ≥ $10

**Actions**
- **Liquidate** card: title, description ("Swaps any vault token worth >$10 USD to SOL via Jupiter. Logs result to data/liquidations.json."), green Run button
- **Distribute** card: title, description ("Sends all undistributed SOL to SMELT holders. 1× weight for held tokens, 1.5× for staked. Logs to data/distributions.json."), blue Run button
- **Terminal output box**: monospace, dark bg, shows live output after action runs. "No output yet" default.
- Only one action can run at a time — button disables while running, spinner shown

**SMELT**
- Circulating supply
- Current epoch number + rate (SMELT per account closed)
- Halving countdown: time until next halving (epoch duration = 6 months)
- Live NAV: `pendingSol / (supply / 1e9)` = SOL per SMELT
- NAV description: "What each SMELT token is currently worth based on the pending distribution pool"

**History**
- Recent liquidations table: date, token (truncated), SOL received, distributed (✓/✗)
- Recent distributions table: date, total SOL, recipient count, tx signatures (truncated + link to Solscan)

---

## 4. Environment Setup

`.env.local` (new file, gitignored):
```
ADMIN_SECRET=your-secret-here
```

Add `ADMIN_SECRET` to `.gitignore` note in CLAUDE.md.
`.env.local` is already gitignored by Next.js by default.

---

## 5. Files to Create / Modify

| Action | File |
|--------|------|
| Create | `components/AppShell.tsx` |
| Modify | `app/layout.tsx` — use AppShell, remove Nav |
| Modify | `app/page.tsx` — remove sidebar, add stats strip |
| Modify | `app/pools/page.tsx` — remove full-page wrapper |
| Create | `app/how-it-works/page.tsx` |
| Create | `app/admin/[token]/page.tsx` |
| Create | `app/api/admin/stats/route.ts` |
| Create | `app/api/admin/run/route.ts` |
| Delete | `components/Nav.tsx` |
| Create | `.env.local` (with placeholder secret) |

---

## 6. Out of Scope

- Mobile responsive sidebar (hamburger menu) — post-launch
- SMELT on-chain yield vault (Option B) — future milestone
- Real-time WebSocket streaming for action output — polling is fine for admin
- Any authentication beyond the hidden URL
