# Swap, Gamification & Mobile Wallets — Design Spec
_Date: 2026-04-13_

## Overview

Three interconnected features added to the SMELT Recycler platform:

1. **Dust-to-SMELT atomic swap** — users convert dust accounts directly to SMELT in one action
2. **Gamification & social** — referral flywheel, recycler leaderboard, ecosystem health dashboard
3. **Mobile wallet support** — Phantom Mobile, Jupiter Mobile, Solflare Mobile via deep linking

---

## Architecture

### New Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Personal hub: Portfolio, Activity, Referrals, Rewards |
| `/community` | Ecosystem health stats + Leaderboard + Live activity feed |
| `/swap` | Dust→SMELT atomic conversion + Jupiter buy widget |

### New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard` | GET `?wallet=` | All stats for one wallet |
| `/api/leaderboard` | GET | Top 20 weekly + all-time |
| `/api/ecosystem` | GET | Platform-wide aggregate totals |
| `/api/referral/register` | POST | Record referral relationship |
| `/api/recycle` | POST (extend) | Accept `referredBy` field, update leaderboard + ecosystem |

### New Data Files

All stored in `data/` as JSON, consistent with existing pattern.

**`data/leaderboard.json`**
```json
{
  "weekly": {
    "since": "2026-04-07T00:00:00Z",
    "entries": {
      "WALLET_ADDRESS": { "accounts": 47, "solReclaimed": 0.094, "smeltEarned": 11750 }
    }
  },
  "allTime": {
    "entries": {
      "WALLET_ADDRESS": { "accounts": 142, "solReclaimed": 0.284, "smeltEarned": 35500 }
    }
  }
}
```

**`data/referrals.json`**
```json
{
  "relationships": {
    "REFERRER_WALLET": [
      { "referee": "BOB_WALLET", "accountsClosed": 5, "solReclaimed": 0.01, "bonusEarned": 0.0001, "date": "2026-04-13T10:00:00Z" }
    ]
  },
  "pendingBonuses": {
    "REFERRER_WALLET": 0.0004
  }
}
```

**`data/ecosystem.json`**
```json
{
  "totalWallets": 1204,
  "totalAccountsClosed": 38491,
  "totalSolReclaimed": 76.98,
  "totalSmeltMinted": 9622750,
  "lastUpdated": "2026-04-13T10:00:00Z"
}
```

---

## Feature Designs

### 1. Dashboard Page (`/dashboard`)

Four sections, stacked vertically. Mobile: same order, single column.

**Portfolio strip**
- SMELT Balance (total), Staked SMELT (with 1.5× badge), NAV per token, SOL earned all-time from distributions
- 4-card grid (2×2 on mobile)
- Sub-line on NAV card: `holdings × NAV = X SOL backing`

**Activity section**
- Accounts recycled all-time, SOL reclaimed all-time, current weekly rank, SMELT earned from recycling, SMELT bought via swap, recycling streak (consecutive calendar weeks with ≥1 account closed — tracked in leaderboard.json)
- 2-column grid of stat pills
- Rank badge highlighted green if top 10

**Referrals section**
- Referral link auto-generated from `window.location.origin + "/?ref=" + walletAddress`  (works on any domain/localhost)
- Copy button + Share button (Web Share API on mobile)
- Count of referred wallets this month
- SOL bonus pending (paid in next weekly distribution)
- Table of recent referrals: abbreviated wallet, accounts closed, bonus earned, date

**Rewards section**
- Distribution history table: date, SOL received, rank that week
- Next distribution date
- Estimated share (based on current weight)
- Weight breakdown: `X unstaked × 1 + Y staked × 1.5 = Z weight units`

### 2. Community Page (`/community`)

**Ecosystem Health (top)**
- 4 big stat cards: Wallets Cleaned, Accounts Closed, SOL Unlocked (returned to users), SMELT Minted
- Framing: "SOL unlocked" = SOL returned to users (not platform revenue)
- Data from `/api/ecosystem`, refreshes every 30s

**Leaderboard**
- Tab toggle: Weekly / All-time
- Weekly shows prize amounts inline for top 3 (🥇 +250 SMELT, 🥈 +150, 🥉 +100)
- Prize pool = 5% of that week's fee revenue, paid in SOL (same mechanism as regular distributions — no SMELT conversion needed)
- Columns: rank, wallet (abbreviated), accounts closed, SOL reclaimed
- Connected wallet's row always highlighted; pinned at bottom if outside top 20

**Live activity feed (bottom)**
- Recent 20 recycling events: wallet, accounts closed, SOL reclaimed, time ago
- Refreshes every 30s
- Pulled from leaderboard data (sorted by date desc)

### 3. Swap Page (`/swap`)

**Mode toggle at top:** `[Dust → SMELT]  [Buy SMELT]`

**Mode 1: Dust → SMELT (atomic)**
- Auto-scans wallet for recyclable accounts (reuses `getTrashAccounts`)
- Shows: account count, SOL to reclaim, estimated SMELT received (Jupiter quote, updated every 10s)
- Two-step progress indicator: `Step 1: Close accounts` → `Step 2: Swap SOL → SMELT`
- Flow: `recycleAccounts()` → on success → Jupiter swap API → SOL → SMELT → wallet
- On failure at step 2: user keeps the SOL (step 1 is already confirmed on-chain)

**Mode 2: Buy SMELT**
- NAV vs market price comparison: current price, NAV, premium/discount %
- Green "trading below backing value" badge when price < NAV
- Jupiter Terminal widget embedded (official embeddable UI, one `<script>` tag)
- Pre-configured to SMELT as output token

### 4. Referral System

**Detection:**
- `app/layout.tsx` reads `?ref=` query param on mount
- Stores in `localStorage` as `referredBy`
- Only stored once (first visit wins, not overwritten)

**Attribution:**
- `POST /api/recycle` extended to include `referredBy` from client
- Server writes to `referrals.json`: records relationship, calculates bonus
- Bonus = 1% of the SOL fee the protocol earned from that recycle (not 1% of user's reclaim)
- Stored in `pendingBonuses` until next weekly distribution run

**Payout:**
- Distribution script (already exists) extended to also pay out `pendingBonuses` from `referrals.json`
- Paid in SOL from the fee wallet, same as regular distributions

### 5. Mobile Wallet Fix (`providers.tsx`)

**Problem:** `PhantomWalletAdapter` only works via browser extension. On mobile browsers, no extension exists, so wallet list is empty or non-functional.

**Fix:** Add `@solana-mobile/wallet-adapter-mobile` → `SolanaMobileWalletAdapter`. This package:
- On mobile browser: generates a deep link that opens the wallet app (Phantom, Jupiter, Solflare)
- After signing: wallet app redirects back to the site
- On desktop: no-op, existing adapters handle it
- In Phantom's in-app browser: detects `window.phantom`, uses it directly (already works)

**Install:**
```bash
npm install @solana-mobile/wallet-adapter-mobile
```

**Wallets supported after fix:** Phantom (desktop + mobile), Solflare (desktop + mobile), Jupiter Mobile, Backpack, Coinbase Wallet, Trust Wallet.

---

## Revenue & Fee Model

| Source | Amount | Destination |
|---|---|---|
| Recycling fee | 5% of SOL reclaimed | Distribution pool |
| Referral bonus | 1% of fee (paid to referrer) | Referrer wallet |
| Weekly leaderboard prize | 5% of weekly fees → SOL | Top 3 recyclers |
| Vault liquidation | 100% of Jupiter proceeds | Distribution pool |
| Swap (Dust→SMELT mode) | No additional fee (recycling fee already applies) | — |
| Buy SMELT (Jupiter widget) | Jupiter's own fee (0.25%) | Jupiter (not platform) |

Net effect on existing holders: marginally reduced distribution share (referral + prize pool draws ~6% of fees). Offset by higher recycling volume from viral referrals and leaderboard competition.

---

## Navigation Changes (`AppShell.tsx`)

```
Current nav:  Recycle  |  Pools  |  How it works
New nav:      Recycle  |  Swap  |  Community  |  Pools  |  How it works
              + Dashboard (shown only when wallet connected)
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Step 2 swap fails (Dust→SMELT) | User keeps SOL. UI shows "Swap failed — your SOL was kept. Try Buy SMELT tab." |
| Jupiter quote unavailable | Disable Convert button, show "Price unavailable" |
| Referral wallet not found in data | Silently ignore, no bonus recorded |
| Leaderboard file missing | API returns empty arrays, page shows empty state |
| Mobile wallet deep link fails | Fall back to showing QR code (WalletConnect standard behaviour) |

---

## Out of Scope

- On-chain referral tracking (future: when mainnet program is upgraded)
- NAV floor buyback mechanism (separate feature, separate spec)
- Auto-compound (separate feature)
- Time-locked staking tiers (separate feature)
- Leaderboard weekly reset automation (manual admin action for now, same pattern as distributions)
