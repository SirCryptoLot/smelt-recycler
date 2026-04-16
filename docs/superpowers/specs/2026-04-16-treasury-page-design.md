# Treasury Page — Design Spec

**Goal:** Rename `/pools` to `/treasury` and redesign it around a clear money-flow story: inflows → pending vault → distributions out. Move staking-specific info to the stake page.

**Architecture:** Two files change — `app/pools/page.tsx` becomes `app/treasury/page.tsx` (full rewrite), and `app/stake/page.tsx` gains a top stakers section. Nav label and href update in `components/AppShell.tsx`. No new API routes needed — existing `/api/stats`, `/api/pool`, and `/api/donations` endpoints supply all data. A redirect from `/pools` to `/treasury` is added in `next.config.js`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS. All data via existing REST endpoints.

---

## Page Structure — `/treasury`

Single scroll, top to bottom. No tabs.

### Section 1 — Inflows strip

Three-column stat grid, same visual pattern as the stake page stat strip:

```tsx
<div className="grid grid-cols-3 border border-gray-100 bg-white rounded-2xl overflow-hidden shadow-sm mt-5">
  <StatCell label="Fees"         value={fmtSol(totalFees)}        sub="from recycling" />
  <StatCell label="Liquidations" value={fmtSol(totalLiqSol)}      sub="tokens → SOL" />
  <StatCell label="Donations"    value={fmtSol(totalDonations)}   sub="direct SOL" green />
</div>
```

`fmtSol(n)`: if >= 1 show `1.284`, if < 1 show `0.0053`, always 4 decimal places.

Data sources:
- `totalFees` — `stats.fees.totalCollected`
- `totalLiqSol` — sum of all `liquidations[].solReceived` from stats
- `totalDonations` — sum of `donations[].amount` from `/api/donations`

### Section 2 — Pending vault card

Single prominent card showing how much SOL is sitting ready to distribute:

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-2">Pending distribution</div>
  <div className="text-4xl font-extrabold tracking-tight tabular-nums text-gray-900">
    {pendingTotal.toFixed(4)}
    <span className="text-lg font-bold text-gray-400 ml-1">SOL</span>
  </div>
  <div className="text-xs text-gray-400 mt-2">
    {undistributedFees.toFixed(4)} fees · {undistributedLiq.toFixed(4)} liquidations · {undistributedDonations.toFixed(4)} donations
  </div>
  {/* Wallet connected: estimated share */}
  {publicKey && estShare > 0 && (
    <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-sm text-green-700 font-bold">
      ~{estShare.toFixed(4)} SOL estimated for you
    </div>
  )}
  {publicKey && estShare === 0 && (
    <div className="mt-3 text-xs text-gray-400">Stake SMELT to earn a share of distributions.</div>
  )}
</div>
```

`pendingTotal = undistributedFees + undistributedLiq + undistributedDonations`

`estShare = (sharePct / 100) * pendingTotal` — `sharePct` from `/api/stake?wallet=`

Next distribution countdown (from `/api/pool`):
```tsx
<div className="mt-3 text-sm text-gray-600">
  Next distribution in <span className="font-bold text-green-600 inline-block tabular-nums" style={{ minWidth: '9ch' }}>{fmtCountdown(msRemaining)}</span>
</div>
```

### Section 3 — Distribution history

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Distribution history</div>
  {distributions.map((d, i) => (
    <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
      <div>
        <div className="text-sm font-semibold text-gray-900">{fmtDateShort(d.date)}</div>
        <div className="text-[11px] text-gray-400">{d.recipientCount} recipients</div>
      </div>
      <div className="text-sm font-bold text-green-600">{d.totalSol.toFixed(4)} SOL</div>
    </div>
  ))}
  {distributions.length === 0 && (
    <div className="text-sm text-gray-400 py-2">No distributions yet.</div>
  )}
</div>
```

Data: last 10 from `/api/pool` `distributions` array (newest first).

### Section 4 — Recent liquidations

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Recent liquidations</div>
  {recentLiquidations.map((liq, i) => (
    <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
      <div>
        <div className="text-sm font-semibold text-gray-900 font-mono">{shortAddr(liq.mint)}</div>
        <div className="text-[11px] text-gray-400">{fmtDateShort(liq.date)}</div>
      </div>
      <div className="text-sm font-bold text-gray-700">{liq.solReceived.toFixed(4)} SOL</div>
    </div>
  ))}
  {recentLiquidations.length === 0 && (
    <div className="text-sm text-gray-400 py-2">No liquidations yet.</div>
  )}
</div>
```

### Section 5 — Recent donations

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Donations</div>
  {donations.map((d, i) => (
    <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
      <div>
        <div className="text-sm font-semibold text-gray-900 font-mono">{shortAddr(d.wallet)}</div>
        <div className="text-[11px] text-gray-400">{fmtDateShort(d.date)}</div>
      </div>
      <div className="text-sm font-bold text-green-600">{d.amount.toFixed(4)} SOL</div>
    </div>
  ))}
  {donations.length === 0 && (
    <div className="text-sm text-gray-400 py-2">No donations yet.</div>
  )}
</div>
```

Data: from `/api/donations` GET endpoint (already exists).

### Section 6 — Vault contents (token table)

Kept from existing pools page — shows tokens accumulating awaiting liquidation. Moved to bottom since it's lower-level detail.

Same table/card layout as current, no changes needed.

---

## Stake Page Addition — Top Stakers

New section at the bottom of `app/stake/page.tsx`, shown always (public data):

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Top stakers</div>
  {topStakers.map((s, i) => (
    <div key={s.wallet} className="flex items-center justify-between py-2.5 [&+&]:border-t border-gray-100">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-gray-300 w-4 tabular-nums">{i + 1}</span>
        <span className="text-sm font-mono text-gray-700">{shortAddr(s.wallet)}</span>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-gray-900 tabular-nums">{fmtSmelt(s.stakedUi)}</div>
        <div className="text-[11px] text-gray-400">{s.sharePct.toFixed(2)}% share</div>
      </div>
    </div>
  ))}
  {topStakers.length === 0 && (
    <div className="text-sm text-gray-400 py-2">No stakers yet.</div>
  )}
</div>
```

**New API endpoint:** `GET /api/stakers` — reads `staking-pool.json`, returns top 10 wallets sorted by `stakedUi` descending:

```typescript
// Response shape
Array<{ wallet: string; stakedUi: number; sharePct: number }>
```

Fetched on mount in `app/stake/page.tsx`, no refresh needed (not time-critical).

---

## Navigation Changes

`components/AppShell.tsx` — update NAV_ITEMS:
```typescript
{ href: '/treasury', label: 'Treasury', icon: '🏦' }  // was /pools, Pools, 🏊
```

`next.config.js` — add redirect:
```javascript
{ source: '/pools', destination: '/treasury', permanent: true }
```

`app/pools/` directory renamed to `app/treasury/`.

---

## Data Fetching

All fetches on mount, no auto-refresh (treasury data doesn't change second-to-second):

```typescript
const [stats, poolData, donations] = await Promise.all([
  fetch('/api/stats').then(r => r.json()),
  fetch('/api/pool').then(r => r.json()),
  fetch('/api/donations').then(r => r.json()),
]);

// If wallet connected:
const stakeData = await fetch(`/api/stake?wallet=${publicKey}`).then(r => r.json());
```

`undistributedDonations`: `donations.filter(d => !d.distributed).reduce((s, d) => s + d.amount, 0)`

---

## Formatting Helpers (inline, not exported)

```typescript
function fmtSol(n: number): string {
  return n.toFixed(4);
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Imminent';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
```

---

## File Summary

| File | Action |
|------|--------|
| `app/treasury/page.tsx` | **Create** — full rewrite of pools page |
| `app/pools/page.tsx` | **Delete** |
| `app/api/stakers/route.ts` | **Create** — top 10 stakers endpoint |
| `app/stake/page.tsx` | **Modify** — add top stakers section |
| `components/AppShell.tsx` | **Modify** — rename nav item to Treasury |
| `next.config.js` | **Modify** — add /pools → /treasury redirect |

---

## Out of Scope

- Donation input form (separate feature, donations.json is empty now — show empty state)
- Pagination of history lists (last 10 is enough)
- Charts or graphs
- Per-wallet distribution receipt history
