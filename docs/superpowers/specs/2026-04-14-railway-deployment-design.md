# Railway Deployment — Design Spec

**Date:** 2026-04-14
**Goal:** Deploy SMELT Recycler to Railway as a persistent Node.js server with a mounted volume for data persistence. Minimal code changes — no rewrite of existing file I/O or API logic.

---

## Context

The app uses `fs.readFileSync`/`fs.writeFileSync` across `lib/*.ts` for 7 JSON data files, and `child_process.exec` in `/api/admin/run` to trigger the liquidator and distributor scripts. These patterns are incompatible with Vercel's serverless model but work natively on Railway's persistent server model.

Two keypairs (`admin.json`, `vault.json`) are currently loaded from `data/keypairs/` — these must never be committed to git and must be injected via environment variables in production.

---

## Infrastructure

### Railway Service
- **Type:** Web service
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Runtime:** Node.js (auto-detected from `package.json`)
- **Region:** US West (or nearest to target users — can be changed)

### Persistent Volume
- **Mount path:** `/data`
- **Purpose:** Stores all 7 runtime JSON files — `fees.json`, `donations.json`, `leaderboard.json`, `ecosystem.json`, `referrals.json`, `liquidations.json`, `distributions.json`
- **Behaviour:** Persists across deploys and restarts. First deploy requires manually seeding existing data files via Railway's built-in shell.

### Environment Variables (set in Railway dashboard)

| Variable | Description |
|---|---|
| `ADMIN_KEYPAIR` | Full contents of `data/keypairs/admin.json` — JSON array of numbers as a string |
| `VAULT_KEYPAIR` | Full contents of `data/keypairs/vault.json` — JSON array of numbers as a string |
| `SOLANA_RPC` | Mainnet RPC endpoint URL (replaces hardcoded Helius key in `lib/solana.ts`) |
| `ADMIN_SECRET` | Secret token for admin API routes |
| `DATA_DIR` | Set to `/data` — the volume mount path |

### Domain
- Railway auto-assigns: `<project>.up.railway.app`
- Custom domain: add CNAME in Railway dashboard after initial deploy

---

## Code Changes

### 1. `lib/paths.ts` — new file

Single exported constant for the data directory. All `lib/*.ts` and `scripts/*.ts` files that currently hardcode `'data/'` or `path.join(process.cwd(), 'data', ...)` import from here instead.

```typescript
import * as path from 'path';
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
```

All existing lib files (`donations.ts`, `leaderboard.ts`, `ecosystem.ts`, `referrals.ts`) and API routes that build data paths update their path construction to use `DATA_DIR`.

### 2. `scripts/mint-smelt.ts`

Replace filesystem keypair load with env var:

```typescript
// Before
const raw = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8')) as number[];

// After
const raw = JSON.parse(process.env.ADMIN_KEYPAIR ?? '[]') as number[];
if (raw.length === 0) throw new Error('ADMIN_KEYPAIR env var not set');
```

### 3. `scripts/liquidate.ts`

Same pattern for vault keypair:

```typescript
// Before
const raw = JSON.parse(fs.readFileSync(VAULT_KEYPAIR_PATH, 'utf-8')) as number[];

// After
const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
```

### 4. `railway.toml` — new file

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

Volume mount is configured in the Railway dashboard UI, not in `railway.toml`.

### 5. `.gitignore` — verify/add

```
data/keypairs/
```

Must be present to ensure secret keys are never committed.

---

## Files Changed Summary

| File | Change |
|---|---|
| `lib/paths.ts` | **Create** — `DATA_DIR` constant |
| `lib/donations.ts` | **Modify** — use `DATA_DIR` |
| `lib/leaderboard.ts` | **Modify** — use `DATA_DIR` |
| `lib/ecosystem.ts` | **Modify** — use `DATA_DIR` |
| `lib/referrals.ts` | **Modify** — use `DATA_DIR` |
| `app/api/recycle/route.ts` | **Modify** — use `DATA_DIR` for fees path |
| `scripts/mint-smelt.ts` | **Modify** — keypair from env var |
| `scripts/liquidate.ts` | **Modify** — keypair from env var |
| `lib/solana.ts` | **Modify** — `MAINNET_RPC` from `process.env.SOLANA_RPC` instead of hardcoded |
| `railway.toml` | **Create** — service config |
| `.gitignore` | **Verify** — keypairs excluded |

---

## What Does NOT Change

- All API route logic — untouched
- `child_process.exec` in `/api/admin/run` — works natively on Railway
- Admin panel UI — untouched
- Liquidator/distributor scripts — logic untouched, only keypair loading changes
- All `lib/*.ts` file I/O patterns — untouched (just data path updates)

---

## Deployment Steps (one-time setup)

1. Connect Railway project to GitHub repo
2. Add environment variables in Railway dashboard
3. Create volume in Railway dashboard, mount at `/data`
4. Deploy — Railway builds and starts the app
5. Open Railway shell → copy existing JSON data files into `/data`
6. Verify app at `<project>.up.railway.app`

---

## Local Dev

No change. `DATA_DIR` env var is absent locally so it falls back to `path.join(process.cwd(), 'data')` — identical to current behaviour. Keypairs still loaded from `data/keypairs/` locally.
