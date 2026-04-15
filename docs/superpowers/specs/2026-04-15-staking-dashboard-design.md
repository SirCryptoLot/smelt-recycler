# Staking Dashboard Enhancement — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic `/stake` page with a full staking dashboard: live epoch countdown, pool stats, your position with estimated next reward, and reward history.

**Architecture:** Two files change — a new `GET /api/pool` endpoint serves public pool stats (vault SOL balance, staker count, epoch timing, distribution history), and `app/stake/page.tsx` is rewritten to consume both `/api/pool` and the existing `/api/stake?wallet=`. No changes to cron, staking-pool.ts, or unstake logic.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, @solana/web3.js for on-chain vault balance read.

---

## Visual Design

Matches the existing site exactly: `#f0faf4` background, `bg-white rounded-2xl border border-gray-100 shadow-sm` cards, `font-extrabold tracking-tight tabular-nums` numbers, `text-[9px] font-bold tracking-widest text-gray-400 uppercase` labels, `rounded-full bg-green-600` primary buttons. Font: Rubik (already loaded via layout).

---

## New File: `app/api/pool/route.ts`

`GET /api/pool` — no auth, public.

Reads from three sources in parallel:
1. `loadPool()` from `lib/staking-pool.ts` — totalSmeltStaked, epochStart, stake record count
2. `connection.getBalance(VAULT_PUBKEY)` — live on-chain vault SOL (uses `MAINNET_RPC`)
3. `loadJson(DISTRIBUTIONS_PATH)` — last 10 entries from `data/distributions.json`

Response shape:
```typescript
{
  totalSmeltStaked: string;        // raw bigint string
  totalSmeltStakedUi: number;      // / 1e9
  stakerCount: number;             // Object.keys(state.stakes).length
  epochStart: string;              // ISO from staking-pool.json
  nextDistributionAt: string;      // epochStart + 48h (ISO)
  vaultSolBalance: number;         // on-chain lamports / LAMPORTS_PER_SOL
  distributableSol: number;        // max(0, vaultSolBalance - 0.01)
  distributions: Array<{
    date: string;
    totalSol: number;
    recipientCount: number;
  }>;                              // last 10, newest first
}
```

`DISTRIBUTIONS_PATH` = `path.join(DATA_DIR, 'distributions.json')` — same as cron.

Error handling: if on-chain fetch fails, return `vaultSolBalance: 0, distributableSol: 0` — never 500 on a stats endpoint.

---

## Modified File: `app/stake/page.tsx`

Full rewrite. Sections rendered top to bottom (single scroll, no tabs):

### Data fetching

Two fetch calls on mount, refreshed every 30 seconds via `setInterval`:

```typescript
// Always fetched (no wallet needed)
const poolData = await fetch('/api/pool').then(r => r.json())

// Only fetched when wallet connected
const stakeData = await fetch(`/api/stake?wallet=${publicKey}`).then(r => r.json())
```

Types:
```typescript
interface PoolData {
  totalSmeltStakedUi: number;
  stakerCount: number;
  epochStart: string;
  nextDistributionAt: string;
  vaultSolBalance: number;
  distributableSol: number;
  distributions: Array<{ date: string; totalSol: number; recipientCount: number }>;
}

interface StakeData {
  staked: string;           // raw bigint string
  stakedUi: number;
  sharePct: number;
  depositedAt: string | null;
  cooldownStartedAt: string | null;
  epochStart: string;
  totalSmeltStaked: string;
}
```

### Countdown timer

```typescript
const [now, setNow] = useState(Date.now());
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, []);
```

Derived values (computed each render, no state):
```typescript
const nextDistMs = poolData ? new Date(poolData.nextDistributionAt).getTime() : 0;
const epochStartMs = poolData ? new Date(poolData.epochStart).getTime() : 0;
const epochDurationMs = 48 * 60 * 60 * 1000;
const epochProgress = poolData
  ? Math.min(100, Math.max(0, ((now - epochStartMs) / epochDurationMs) * 100))
  : 0;
const msRemaining = Math.max(0, nextDistMs - now);
```

Countdown format helper:
```typescript
function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Imminent';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}
```

### Section 1 — Page header

```tsx
<h1 className="text-3xl font-extrabold text-gray-900 tracking-tight pt-6">Stake SMELT</h1>
<p className="text-gray-400 text-sm mt-1">Lock SMELT to earn SOL rewards every epoch.</p>
```

### Section 2 — Stat strip

Three-column grid, same pattern as the recycler's stats strip at top of `app/page.tsx`:

```tsx
<div className="grid grid-cols-3 border border-gray-100 bg-white rounded-2xl overflow-hidden shadow-sm mt-5">
  <StatCell label="Pool SMELT" value={fmtSmelt(poolData?.totalSmeltStakedUi ?? 0)} sub="total staked" />
  <StatCell label="Vault SOL"  value={(poolData?.distributableSol ?? 0).toFixed(3)} sub="pending dist." green />
  <StatCell label="Stakers"    value={String(poolData?.stakerCount ?? '—')} sub="active" />
</div>
```

`StatCell` is an inline component (not exported):
```tsx
function StatCell({ label, value, sub, green }: { label: string; value: string; sub: string; green?: boolean }) {
  return (
    <div className="px-3 py-3.5 [&+&]:border-l border-gray-100">
      <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">{label}</div>
      <div className={`text-xl font-extrabold tracking-tight tabular-nums leading-none ${green ? 'text-green-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-gray-400 text-[10px] mt-1">{sub}</div>
    </div>
  );
}
```

`fmtSmelt`: formats raw UI number — if >= 1_000_000 show `1.2M`, if >= 1_000 show `12.5K`, else show integer.

### Section 3 — Epoch card

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="flex justify-between items-center mb-3">
    <span className="text-sm font-bold text-gray-900">Epoch progress</span>
    <span className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs font-bold text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Active
    </span>
  </div>
  {/* Progress bar */}
  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
    <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${epochProgress}%` }} />
  </div>
  {/* Times */}
  <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
    <span>{fmtDate(poolData?.epochStart)}</span>
    <span className="font-bold text-gray-600">{epochProgress.toFixed(0)}%</span>
    <span>{fmtDate(poolData?.nextDistributionAt)}</span>
  </div>
  {/* Countdown */}
  <div className="mt-3 text-sm text-gray-600">
    Next distribution in{' '}
    <span className="font-bold text-green-600">{fmtCountdown(msRemaining)}</span>
    {' · '}~<span className="font-bold text-gray-900">{(poolData?.distributableSol ?? 0).toFixed(4)} SOL</span> to distribute
  </div>
</div>
```

`fmtDate(iso)`: returns `"Apr 15, 09:00"` format using `toLocaleDateString` + `toLocaleTimeString` with `{ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }`.

### Section 4 — Your position (wallet connected only)

Shown when `publicKey` is set. Rows follow the pattern from existing `app/page.tsx` account rows.

Status pill logic:
- `cooldownStartedAt` set AND cooldown not elapsed → amber "In cooldown · unlocks Apr 22"
- `cooldownStartedAt` set AND cooldown elapsed → amber "Ready to unstake"
- `depositedAt >= epochStart` → yellow "Waiting for next epoch" (staked too recently)
- else → green "Earning rewards"

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Your position</div>
  <Row label="Wallet SMELT"  value={fmtSmeltFull(walletSmelt)} />
  <Row label="Staked SMELT"  value={fmtSmeltFull(stakeData?.stakedUi ?? 0)} green />
  <Row label="Pool share"    value={`${(stakeData?.sharePct ?? 0).toFixed(3)}%`} green />
  <Row label="Staked since"  value={stakeData?.depositedAt ? fmtDateShort(stakeData.depositedAt) : '—'} />
  <Row label="Status"        value={<StatusPill stakeData={stakeData} poolData={poolData} now={now} />} />
</div>
```

`Row` and `StatusPill` are inline components. `fmtSmeltFull` always shows two decimal places (e.g. `50,000.00`).

### Section 5 — Estimated next reward (wallet connected + staked > 0 + not in cooldown)

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Estimated next reward</div>
  <div className="text-center py-2">
    <div className="text-4xl font-extrabold tracking-tight text-gray-900">
      <span className="text-green-500">+</span>
      {estimatedReward.toFixed(4)}
      <span className="text-lg font-bold text-gray-400 ml-1">SOL</span>
    </div>
    <div className="text-xs text-gray-400 mt-1">
      {(stakeData?.sharePct ?? 0).toFixed(3)}% of {(poolData?.distributableSol ?? 0).toFixed(4)} SOL vault
    </div>
  </div>
  <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 mt-3 text-xs text-green-800 leading-relaxed">
    Estimate only — final amount depends on vault balance and eligible stakers at distribution time.
  </div>
</div>
```

`estimatedReward = ((stakeData?.sharePct ?? 0) / 100) * (poolData?.distributableSol ?? 0)`

Only shown if `stakeData?.stakedUi > 0 && !stakeData?.cooldownStartedAt`.

### Section 6 — Stake form

Same as existing, no logic changes. Hidden when `cooldownStartedAt` is set.

### Section 7 — Unstake buttons

Same logic as existing page. No changes.

### Section 8 — Reward history (shown when poolData has distributions)

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mt-3">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">Reward history</div>
  {poolData.distributions.map((d, i) => {
    const estimated = ((stakeData?.sharePct ?? 0) / 100) * d.totalSol;
    return (
      <div key={i} className="flex justify-between items-center py-2.5 [&+&]:border-t border-gray-100">
        <div>
          <div className="text-sm font-semibold text-gray-900">{fmtDateShort(d.date)}</div>
          <div className="text-[11px] text-gray-400">{d.totalSol.toFixed(4)} SOL distributed · {d.recipientCount} stakers</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-green-600">
            {publicKey ? `+${estimated.toFixed(4)} SOL` : '—'}
          </div>
          <div className="text-[11px] text-gray-400">{publicKey ? 'est. earned' : 'connect wallet'}</div>
        </div>
      </div>
    );
  })}
  {poolData.distributions.length === 0 && (
    <div className="text-sm text-gray-400 py-2">No distributions yet.</div>
  )}
</div>
```

### Disconnected state

When wallet not connected, show the stat strip + epoch card (public data) + a centered "Connect wallet to see your position" prompt with `<WalletMultiButton />`. Reward history shows `—` for estimated column.

### Loading state

While `poolData` is null (initial fetch), show a single spinner centered in the page. No skeleton loaders.

### Error handling

If `/api/pool` fails, show a subtle inline error: `"Could not load pool data."` No crash.

---

## Formatting Helpers (all in page.tsx, not exported)

```typescript
function fmtSmelt(ui: number): string {
  if (ui >= 1_000_000) return `${(ui / 1_000_000).toFixed(1)}M`;
  if (ui >= 1_000) return `${(ui / 1_000).toFixed(1)}K`;
  return ui.toFixed(0);
}

function fmtSmeltFull(ui: number): string {
  return ui.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
```

---

## File Summary

| File | Action |
|------|--------|
| `app/api/pool/route.ts` | **Create** — public pool stats endpoint |
| `app/stake/page.tsx` | **Rewrite** — full dashboard UI |

No other files change.

---

## Out of Scope

- Wallet SMELT balance fetched via existing `fetchSmeltBalance` from `lib/smelt.ts` (already works)
- Cron, staking-pool.ts, unstake route — no changes
- Per-wallet actual payout recording — estimated is sufficient
- Pagination of reward history — last 10 is enough
