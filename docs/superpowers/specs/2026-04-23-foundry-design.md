# The Foundry — Design Spec
**Date:** 2026-04-23
**Status:** Approved

---

## Overview

A public world map at `/foundry` — a top-down pixel grid of 500 forge stations representing the SMELT Recycler community. Each plot is owned by a real wallet. Owning a forge gives a permanent **1.25× SMELT multiplier** on all future recycling. Plots are finite (500 total), one per wallet, claimed by burning SMELT after recycling 10+ accounts.

The name and aesthetic tie directly to the SMELT token: you smelt junk tokens into pure SMELT — exactly like a foundry melts ore into metal.

---

## User Flow

1. User recycles 10+ accounts on the main page — the Claim button on `/foundry` becomes active for their wallet.
2. User visits `/foundry`, sees the grid map, finds unclaimed plots.
3. They click **Claim a Forge** — a modal confirms the cost (5,000 SMELT burned on-chain).
4. After confirmation, their forge appears on the map immediately (lowest available plot number).
5. From now on, every recycle earns 1.25× SMELT instead of the base rate.
6. Dashboard shows a forge badge: *"Forge owned · 1.25× SMELT boost active"*.

Anyone can view `/foundry` without connecting a wallet — it's a public world map.

---

## The Map

**Dimensions:** 500 plots total, displayed in a responsive grid (20×25 on desktop, scrollable on mobile).

**Background:** Dark charcoal (`#0c0a06`) with amber/fire accent tones (`#78350f`, `#fbbf24`).

**Plot states:**

| State | Visual | Description |
|---|---|---|
| Empty | Dashed amber border, no icon | Available to claim |
| Owned — small | 🔥 solid border | 10–24 accounts smelted |
| Owned — medium | ⚒️ solid border | 25–49 accounts smelted |
| Owned — large | 🏭 solid border | 50–99 accounts smelted |
| Owned — master | 💎 solid border | 100+ accounts smelted |
| Yours | 🏆 gold border + glow | Your forge, any level |

**Interaction — click owned plot → popup:**
```
Forge #47
5gGqU2…HK5
47 accounts smelted · 11,750 SMELT extracted
Active since Apr 2026
```
Auto-generated from the owner's stats at the time of claiming. Never changes after claim.

**If the connected wallet owns a plot:** their plot always renders with the gold 🏆 icon and a gold border, regardless of recycling level.

---

## Claiming a Forge

**Requirements:**
1. Wallet must have recycled **10+ accounts** (checked server-side via `getWalletStats`)
2. Wallet must not already own a plot (1 per wallet)
3. At least 1 unclaimed plot must remain

**Process:**
1. User clicks **Claim a Forge** on `/foundry`
2. Modal shows: cost (5,000 SMELT), assigned plot number (next available), and the auto-generated inscription preview
3. User signs a transaction that burns 5,000 SMELT (transfer to token burn address: `1nc1nerator11111111111111111111111111111111`)
4. After tx confirms, frontend POSTs to `/api/foundry/claim` with `{ wallet, txSignature }`
5. Server verifies eligibility + tx, writes to `data/foundry.json`, returns `{ plotId, inscription }`
6. Map updates immediately

**Plot assignment:** lowest available integer ID (1–500). Sequential and fair — no picking.

**Non-transferable in v1.** Plot is permanently bound to the claiming wallet. NFT wrapping is out of scope for this version.

---

## The 1.25× SMELT Multiplier

Applied server-side in `/api/recycle`:

```
smeltMinted = base * (ownsForge ? 1.25 : 1.0)
```

- `ownsForge` is determined by looking up the wallet in `data/foundry.json`
- The multiplier applies to every recycle after claiming — permanently
- No cap, no expiry

**Dashboard badge** (when forge is owned):
```
⚒ Forge owned · 1.25× SMELT boost active
```
Shown in the SMELT Holdings section of the Dashboard.

---

## Data Model

**`data/foundry.json`:**
```json
{
  "plots": [
    {
      "id": 47,
      "owner": "5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5",
      "claimedAt": "2026-04-23T12:00:00.000Z",
      "smeltBurned": 5000,
      "inscription": "Forge #47 · 5gGqU2…HK5 · 47 accounts smelted · 11,750 SMELT extracted · Active since Apr 2026"
    }
  ]
}
```

**Helper functions in `lib/foundry.ts`:**
- `getPlots()` → all plots from JSON
- `getPlotByOwner(wallet)` → plot or null
- `getNextPlotId()` → lowest unused integer 1–500
- `recordPlot(entry)` → append to foundry.json
- `ownsForge(wallet)` → boolean (used in recycle route)

---

## Routes

### `GET /api/foundry`
Returns all plots with owner stats enriched from leaderboard:
```json
{
  "totalPlots": 500,
  "claimedCount": 47,
  "plots": [
    {
      "id": 47,
      "owner": "5gGqU2...",
      "shortOwner": "5gGqU2…HK5",
      "claimedAt": "2026-04-23T...",
      "inscription": "...",
      "accounts": 47,
      "smeltEarned": 11750
    }
  ]
}
```
Response cached with `Cache-Control: public, max-age=30, stale-while-revalidate=120`.

### `POST /api/foundry/claim`
Request body: `{ wallet: string, txSignature: string }`

Validates:
1. `wallet` has 10+ all-time accounts recycled
2. `wallet` does not already own a plot
3. Plots remain (< 500 claimed)
4. `txSignature` confirms a 5,000 SMELT burn from `wallet` (verify via `connection.getTransaction`)

On success: writes plot to `data/foundry.json`, returns `{ plotId, inscription }`.

On failure: returns `{ error }` with appropriate status code.

---

## Page: `/foundry`

**File:** `app/foundry/page.tsx` — client component (needs wallet connection state + live map).

**Sections:**
1. **Header** — "The Foundry" title, subtitle ("500 forge stations. One per smelter."), live stats strip: *X forges claimed · Y plots remaining*
2. **Grid map** — all 500 plots rendered. Empty = claimable. Owned = icon + border. Clicking owned shows popup. Clicking empty (when eligible) opens claim modal.
3. **Claim modal** — shows assigned plot ID, inscription preview, 5,000 SMELT cost, Confirm button (triggers wallet tx)
4. **Your forge panel** — shown at top when connected + owns a plot. Shows plot ID, inscription, 1.25× badge.

**No wallet connection required to view.** Wallet required only to claim.

---

## Dashboard Integration

**File:** `app/dashboard/page.tsx`

In the SMELT Holdings section, after the SMELT balance row, add:

```
If ownsForge:
  ⚒ Forge #47 owned  ·  1.25× SMELT boost active  →  (links to /foundry)

If eligible but not claimed (allTimeAccounts >= 10):
  ⚒ You can claim a forge  →  (links to /foundry)
```

The "eligible but not claimed" nudge is non-intrusive — small text row, not a banner.

---

## Files

| File | Action |
|---|---|
| `lib/foundry.ts` | **Create** — data helpers |
| `data/foundry.json` | **Create** — empty `{ "plots": [] }` |
| `app/foundry/page.tsx` | **Create** — grid map + claim UI |
| `app/api/foundry/route.ts` | **Create** — GET all plots |
| `app/api/foundry/claim/route.ts` | **Create** — POST claim |
| `app/api/recycle/route.ts` | **Modify** — apply 1.25× multiplier |
| `app/dashboard/page.tsx` | **Modify** — forge badge + nudge |

---

## Out of Scope

- NFT minting / Metaplex integration (v2)
- Plot transfer or marketplace
- Multiple plots per wallet
- Plot upgrades or tiers beyond icon scaling
- Custom inscription text (always auto-generated)
- Token-level tracking per plot (what specific tokens were smelted)
