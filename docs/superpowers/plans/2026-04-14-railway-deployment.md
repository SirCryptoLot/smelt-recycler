# Railway Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy SMELT Recycler to Railway as a persistent Node.js server, migrating keypairs to env vars and data paths to a mounted volume with minimal code changes.

**Architecture:** A single Railway web service runs `next start` on a persistent Node.js process. A Railway volume mounted at `/data` replaces local `data/*.json` files. Both keypairs (`admin`, `vault`) are loaded from environment variables instead of the filesystem. `MAINNET_RPC` moves from a hardcoded Helius URL to an env var.

**Tech Stack:** Next.js 14, Railway (Nixpacks), Railway Volumes, TypeScript, ts-node

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `"start": "next start"`, move `ts-node`+`typescript` to `dependencies` |
| `lib/paths.ts` | **Create** — exports `DATA_DIR` constant |
| `lib/donations.ts` | Use `DATA_DIR` for `DONATIONS_PATH` |
| `lib/leaderboard.ts` | Use `DATA_DIR` for `PATH` |
| `lib/ecosystem.ts` | Use `DATA_DIR` for `PATH` |
| `lib/referrals.ts` | Use `DATA_DIR` for `PATH` |
| `app/api/recycle/route.ts` | Use `DATA_DIR` for `FEES_PATH` |
| `lib/solana.ts` | `MAINNET_RPC` from `process.env.SOLANA_RPC` |
| `scripts/mint-smelt.ts` | Load admin keypair from `process.env.ADMIN_KEYPAIR` |
| `scripts/liquidate.ts` | Load vault keypair from env var, data path from `DATA_DIR` |
| `scripts/distribute.ts` | Load admin keypair from env var, data paths from `DATA_DIR` |
| `railway.toml` | **Create** — Railway service config |

---

## Task 1: Fix `package.json` — add start script + move runtime deps

**Files:**
- Modify: `package.json`

Railway needs `npm start` to launch the app. `ts-node` and `typescript` must be in `dependencies` (not `devDependencies`) because `npm run liquidate` / `npm run distribute` call `ts-node` at runtime on the server.

- [ ] **Step 1: Add `start` script and move `ts-node` + `typescript`**

In `package.json`, add `"start": "next start"` to the `scripts` block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "jest",
  "test:frontend": "jest --config jest.frontend.config.js",
  "test:watch": "jest --watch",
  "liquidate": "ts-node --project tsconfig.scripts.json scripts/liquidate.ts",
  "distribute": "ts-node --project tsconfig.scripts.json scripts/distribute.ts",
  "admin": "ts-node --project tsconfig.scripts.json scripts/admin.ts"
},
```

Then move `ts-node` and `typescript` from `devDependencies` to `dependencies`:

```json
"dependencies": {
  "@coral-xyz/anchor": "^0.32.1",
  "@solana-mobile/wallet-adapter-mobile": "^1.0.1",
  "@solana/spl-token": "^0.4.9",
  "@solana/wallet-adapter-base": "^0.9.23",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-react-ui": "^0.9.35",
  "@solana/wallet-adapter-wallets": "^0.19.32",
  "@solana/web3.js": "^1.98.0",
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "ts-node": "^10.9.2",
  "typescript": "^5.7.2"
},
```

And remove them from `devDependencies`:

```json
"devDependencies": {
  "@testing-library/jest-dom": "^6.6.3",
  "@testing-library/react": "^16.3.0",
  "@testing-library/user-event": "^14.5.2",
  "@types/chai": "^5.2.3",
  "@types/jest": "^29.5.14",
  "@types/mocha": "^10.0.10",
  "@types/node": "^22",
  "@types/react": "~18.2.0",
  "@types/react-dom": "~18.2.0",
  "autoprefixer": "^10.4.20",
  "chai": "^6.2.2",
  "jest": "^29.7.0",
  "jest-environment-jsdom": "^29.7.0",
  "mocha": "^11.7.5",
  "postcss": "^8.4.47",
  "tailwindcss": "^3.4.15",
  "ts-jest": "^29.3.1",
  "ts-mocha": "^11.1.0"
},
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output (zero errors in production code)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "fix: add start script, move ts-node+typescript to dependencies for Railway"
```

---

## Task 2: Create `lib/paths.ts` + update data paths in `lib/*.ts` and `app/api/recycle/route.ts`

**Files:**
- Create: `lib/paths.ts`
- Modify: `lib/donations.ts`
- Modify: `lib/leaderboard.ts`
- Modify: `lib/ecosystem.ts`
- Modify: `lib/referrals.ts`
- Modify: `app/api/recycle/route.ts`

- [ ] **Step 1: Create `lib/paths.ts`**

```typescript
// lib/paths.ts
import * as path from 'path';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
```

- [ ] **Step 2: Update `lib/donations.ts`**

Replace line 13:
```typescript
// Before
const DONATIONS_PATH = path.join(process.cwd(), 'data/donations.json');
```

With:
```typescript
// After — add this import after the existing imports
import { DATA_DIR } from './paths';

const DONATIONS_PATH = path.join(DATA_DIR, 'donations.json');
```

Also remove `import * as path from 'path';` only if `path` is no longer used elsewhere in the file. It IS still used in `path.join`, so keep it.

Full updated top of file:
```typescript
// lib/donations.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

export interface DonationEntry {
  date: string;
  wallet: string;
  solDonated: number;
  pct: number;
  txSignature: string;
}

const DONATIONS_PATH = path.join(DATA_DIR, 'donations.json');
```

- [ ] **Step 3: Update `lib/leaderboard.ts`**

Replace line 5 and add the import. Replace:
```typescript
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/leaderboard.json');
```

With:
```typescript
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'leaderboard.json');
```

- [ ] **Step 4: Update `lib/ecosystem.ts`**

Replace line 5 and add the import. Replace:
```typescript
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/ecosystem.json');
```

With:
```typescript
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'ecosystem.json');
```

- [ ] **Step 5: Update `lib/referrals.ts`**

Replace line 5 and add the import. Replace:
```typescript
import * as path from 'path';

const PATH = path.join(process.cwd(), 'data/referrals.json');
```

With:
```typescript
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'referrals.json');
```

- [ ] **Step 6: Update `app/api/recycle/route.ts`**

At the top of the file, add the `DATA_DIR` import alongside existing imports:
```typescript
import { DATA_DIR } from '../../../lib/paths';
```

Replace line 12:
```typescript
// Before
const FEES_PATH = path.join(process.cwd(), 'data/fees.json');
```

With:
```typescript
// After
const FEES_PATH = path.join(DATA_DIR, 'fees.json');
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
git add lib/paths.ts lib/donations.ts lib/leaderboard.ts lib/ecosystem.ts lib/referrals.ts app/api/recycle/route.ts
git commit -m "feat: introduce DATA_DIR constant for Railway volume support"
```

---

## Task 3: Update `lib/solana.ts` — MAINNET_RPC from env var

**Files:**
- Modify: `lib/solana.ts`

The Helius API key is currently hardcoded. On Railway, set `SOLANA_RPC` to the full endpoint URL as an env var. Locally it falls back to the same Helius URL so local dev is unchanged.

- [ ] **Step 1: Update `lib/solana.ts`**

Replace line 6:
```typescript
// Before
export const MAINNET_RPC = 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';
```

With:
```typescript
// After
export const MAINNET_RPC = process.env.SOLANA_RPC ?? 'https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add lib/solana.ts
git commit -m "fix: load MAINNET_RPC from SOLANA_RPC env var, fall back to local key"
```

---

## Task 4: Update `scripts/mint-smelt.ts` — admin keypair from env var

**Files:**
- Modify: `scripts/mint-smelt.ts`

- [ ] **Step 1: Replace the keypair loading logic**

Remove lines 21–26 (the `ADMIN_KEYPAIR_PATH` constant and `loadAdminKeypair` function). Replace with:

```typescript
function loadAdminKeypair(): Keypair {
  const raw = JSON.parse(process.env.ADMIN_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('ADMIN_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
```

Also remove the unused `fs` and `path` imports if they are no longer used in the file. Check by searching for any remaining `fs.` or `path.` references — there are none after this change, so remove:

```typescript
import * as fs from 'fs';
import * as path from 'path';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add scripts/mint-smelt.ts
git commit -m "fix: load admin keypair from ADMIN_KEYPAIR env var in mint-smelt"
```

---

## Task 5: Update `scripts/liquidate.ts` — vault keypair + data path from env

**Files:**
- Modify: `scripts/liquidate.ts`

- [ ] **Step 1: Add `DATA_DIR` import and replace path constants**

At the top of the file, add after existing imports:
```typescript
import { DATA_DIR } from '../lib/paths';
```

Replace lines 19–25 (the two path constants and `loadKeypair` function):

```typescript
// Before
const DATA_PATH = path.join(__dirname, '../data/liquidations.json');
const VAULT_KEYPAIR_PATH = path.join(__dirname, '../data/keypairs/vault.json');

function loadKeypair(filepath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
```

With:

```typescript
// After
const DATA_PATH = path.join(DATA_DIR, 'liquidations.json');

function loadVaultKeypair(): Keypair {
  const raw = JSON.parse(process.env.VAULT_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('VAULT_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
```

- [ ] **Step 2: Update the call site inside `main()`**

In the `main()` function, replace:
```typescript
const vaultKeypair = loadKeypair(VAULT_KEYPAIR_PATH);
```

With:
```typescript
const vaultKeypair = loadVaultKeypair();
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add scripts/liquidate.ts
git commit -m "fix: load vault keypair from env var, data path from DATA_DIR in liquidate"
```

---

## Task 6: Update `scripts/distribute.ts` — admin keypair + data paths from env

**Files:**
- Modify: `scripts/distribute.ts`

- [ ] **Step 1: Add `DATA_DIR` import**

After the existing imports at the top of the file, add:
```typescript
import { DATA_DIR } from '../lib/paths';
```

- [ ] **Step 2: Replace the four path constants**

Replace lines 44–47:
```typescript
// Before
const LIQUIDATIONS_PATH = path.join(__dirname, '../data/liquidations.json');
const DISTRIBUTIONS_PATH = path.join(__dirname, '../data/distributions.json');
const FEES_PATH = path.join(__dirname, '../data/fees.json');
const ADMIN_KEYPAIR_PATH = path.join(__dirname, '../data/keypairs/admin.json');
```

With:
```typescript
// After
const LIQUIDATIONS_PATH = path.join(DATA_DIR, 'liquidations.json');
const DISTRIBUTIONS_PATH = path.join(DATA_DIR, 'distributions.json');
const FEES_PATH = path.join(DATA_DIR, 'fees.json');
```

- [ ] **Step 3: Replace the `loadKeypair` function**

Find the `loadKeypair` function (lines 51–54):
```typescript
function loadKeypair(filepath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
```

Replace with:
```typescript
function loadAdminKeypair(): Keypair {
  const raw = JSON.parse(process.env.ADMIN_KEYPAIR ?? '[]') as number[];
  if (raw.length === 0) throw new Error('ADMIN_KEYPAIR env var not set');
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
```

- [ ] **Step 4: Update the call site**

Find where `loadKeypair(ADMIN_KEYPAIR_PATH)` is called in `main()` and replace with `loadAdminKeypair()`.

```bash
# Find the call site first
grep -n "loadKeypair" /c/recycle/scripts/distribute.ts
```

Replace the line it finds (will look like):
```typescript
const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);
```

With:
```typescript
const adminKeypair = loadAdminKeypair();
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add scripts/distribute.ts
git commit -m "fix: load admin keypair from env var, data paths from DATA_DIR in distribute"
```

---

## Task 7: Create `railway.toml` + final check

**Files:**
- Create: `railway.toml`

- [ ] **Step 1: Create `railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

- [ ] **Step 2: Verify `.gitignore` covers keypairs**

```bash
grep "data/" /c/recycle/.gitignore
```

Expected output includes `data/` — this already covers `data/keypairs/` so no change needed.

- [ ] **Step 3: Final TypeScript compile check**

```bash
cd /c/recycle && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add railway.toml
git commit -m "feat: add railway.toml for Railway deployment config"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin master
```

---

## Task 8: Railway Dashboard Setup (manual)

This task is performed in the Railway web UI at **https://railway.app**. No code changes.

- [ ] **Step 1: Create a new project**

In the Railway dashboard → "New Project" → "Deploy from GitHub repo" → select your repo.

Railway auto-detects Node.js and runs `npm run build` then `npm start`.

- [ ] **Step 2: Add environment variables**

In the Railway service → "Variables" tab → add each variable:

| Variable | Value |
|---|---|
| `ADMIN_KEYPAIR` | Paste the full content of your local `data/keypairs/admin.json` |
| `VAULT_KEYPAIR` | Paste the full content of your local `data/keypairs/vault.json` |
| `SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=1a8ff065-5926-455f-a320-984253bfea15` (or regenerate key first) |
| `ADMIN_SECRET` | Your existing admin secret value |
| `DATA_DIR` | `/data` |

- [ ] **Step 3: Create and mount the persistent volume**

In the Railway service → "Volumes" tab → "New Volume":
- **Mount path:** `/data`
- Click "Create"

Railway will redeploy automatically after adding the volume.

- [ ] **Step 4: Seed initial data files into the volume**

In the Railway service → "..." menu → "Railway Shell" (opens a terminal into the running container).

Run these commands in the shell to seed your existing local data:

```bash
# Verify the volume is mounted
ls /data

# Create initial empty files if they don't exist yet
# (paste your local data file contents here, or start fresh)
echo '[]' > /data/fees.json
echo '[]' > /data/donations.json
echo '[]' > /data/referrals.json
echo '[]' > /data/liquidations.json
echo '[]' > /data/distributions.json
echo '{"totalWallets":0,"totalAccountsClosed":0,"totalSolReclaimed":0,"totalSmeltMinted":0}' > /data/ecosystem.json
echo '{"weekly":{"since":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","entries":[]},"allTime":{"entries":[]}}' > /data/leaderboard.json
```

If you have existing data locally that you want to preserve, paste the actual JSON content instead of the empty defaults above.

- [ ] **Step 5: Verify the deployment**

Visit your Railway app URL (shown in the Railway dashboard under "Domains") — it will look like `<project>.up.railway.app`.

Check:
- [ ] Home page loads
- [ ] `/api/donations` returns `{"totalSolDonated":0,"donationCount":0}`
- [ ] `/api/ecosystem` returns the ecosystem stats
- [ ] Admin panel loads at `/admin/<your-token>`

- [ ] **Step 6: (Optional) Add a custom domain**

In Railway service → "Settings" → "Domains" → add your domain and point your DNS CNAME to the Railway-provided value.
