# Trash Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]>` in `lib/solana.ts` — fetches all SPL token accounts for a wallet, prices them via Jupiter in chunks of 50, and returns only those below the $0.10 trash threshold.

**Architecture:** Module-level `Connection` singleton pointing at mainnet. `getParsedTokenAccountsByOwner` with JSON encoding avoids a separate mint-info call (decimals already applied). Mints chunked at 50 and priced in parallel. Unlisted mints get `pricePerToken: 0` and are treated as trash.

**Tech Stack:** TypeScript 5, @solana/web3.js ^1.98, @solana/spl-token ^0.4, Jest 29 + ts-jest (unit tests), native `fetch` (Node 18+)

---

## File Map

| File | Role |
|---|---|
| `package.json` | Project manifest, `test` script |
| `tsconfig.json` | TypeScript config — CommonJS, strict |
| `jest.config.js` | Jest preset (ts-jest, node env) |
| `lib/solana.ts` | `connection` singleton, `TrashAccount` interface, `chunk`, `fetchPrices`, `getTrashAccounts` |
| `lib/__tests__/solana.test.ts` | Unit tests — all RPC and `fetch` calls mocked |

---

### Task 1: Initialize project dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "recycle",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@solana/spl-token": "^0.4.9",
    "@solana/web3.js": "^1.98.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.1",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["lib"]
}
```

- [ ] **Step 3: Create `jest.config.js`**

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no peer-dep errors.

- [ ] **Step 5: Init git and commit**

```bash
git init
git add package.json package-lock.json tsconfig.json jest.config.js
git commit -m "chore: initialize project with Solana and Jest deps"
```

---

### Task 2: Define TrashAccount interface and module skeleton (TDD)

**Files:**
- Create: `lib/__tests__/solana.test.ts`
- Create: `lib/solana.ts`

- [ ] **Step 1: Write the test file (will fail — module missing)**

```typescript
// lib/__tests__/solana.test.ts
import { PublicKey } from '@solana/web3.js';
import * as solanaModule from '../solana';

const WALLET   = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_BONK = 'DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ACCT_BONK = new PublicKey('11111111111111111111111111111112');
const ACCT_USDC = new PublicKey('11111111111111111111111111111113');

function makeAccount(pubkey: PublicKey, mint: string, uiAmount: number) {
  return {
    pubkey,
    account: { data: { parsed: { info: { mint, tokenAmount: { uiAmount } } } } },
  };
}

describe('getTrashAccounts', () => {
  let mockGetParsed: jest.SpyInstance;

  beforeEach(() => {
    mockGetParsed = jest
      .spyOn(solanaModule.connection, 'getParsedTokenAccountsByOwner')
      .mockResolvedValue({ value: [] } as any);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is exported and returns a Promise', () => {
    const result = solanaModule.getTrashAccounts(WALLET);
    expect(result).toBeInstanceOf(Promise);
    return result;
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `Cannot find module '../solana'`

- [ ] **Step 3: Create `lib/solana.ts` skeleton**

```typescript
// lib/solana.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

export const connection = new Connection(MAINNET_RPC, 'confirmed');

export interface TrashAccount {
  pubkey: PublicKey;
  mint: PublicKey;
  balance: number;        // UI amount (decimals applied)
  usdValue: number;       // balance × pricePerToken
  pricePerToken: number;  // 0 if unlisted
}

export async function getTrashAccounts(_walletAddress: PublicKey): Promise<TrashAccount[]> {
  return [];
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `Tests: 1 passed, 1 total`

- [ ] **Step 5: Commit**

```bash
git add lib/solana.ts lib/__tests__/solana.test.ts
git commit -m "feat: add TrashAccount interface and getTrashAccounts skeleton"
```

---

### Task 3: Fetch token accounts from RPC and filter zero-balance (TDD)

**Files:**
- Modify: `lib/__tests__/solana.test.ts` — add 2 tests inside the describe block
- Modify: `lib/solana.ts` — implement RPC call

- [ ] **Step 1: Add failing tests (inside `describe('getTrashAccounts')`, after the existing test)**

```typescript
  it('returns empty array when wallet has no token accounts', async () => {
    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
    expect(mockGetParsed).toHaveBeenCalledWith(
      WALLET,
      { programId: expect.any(Object) }
    );
  });

  it('filters out zero-balance accounts without calling Jupiter', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 0)],
    } as any);

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `expect(mockGetParsed).toHaveBeenCalledWith(...)` fails — skeleton never calls RPC.

- [ ] **Step 3: Implement RPC fetch in `lib/solana.ts`**

Replace the `getTrashAccounts` stub:

```typescript
export async function getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]> {
  const { value: accounts } = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    { programId: TOKEN_PROGRAM_ID }
  );

  const nonEmpty = accounts.filter(
    (a) => (a.account.data.parsed.info.tokenAmount.uiAmount as number) > 0
  );

  if (nonEmpty.length === 0) return [];

  // price fetching — next task
  return [];
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 5: Commit**

```bash
git add lib/solana.ts lib/__tests__/solana.test.ts
git commit -m "feat: fetch token accounts and filter zero-balance"
```

---

### Task 4: Fetch Jupiter prices in chunks of 50 (TDD)

**Files:**
- Modify: `lib/__tests__/solana.test.ts` — add 3 tests
- Modify: `lib/solana.ts` — add `chunk`, `fetchPrices`, wire into `getTrashAccounts`

- [ ] **Step 1: Add failing tests (inside `describe('getTrashAccounts')`, after Task 3's tests)**

```typescript
  it('calls Jupiter with the mint address and maps pricePerToken', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_BONK]: { price: 0.0000002 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(MINT_BONK)
    );
    expect(result[0].pricePerToken).toBe(0.0000002);
  });

  it('treats unlisted mints (no Jupiter entry) as pricePerToken 0', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }), // MINT_BONK absent
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result[0].pricePerToken).toBe(0);
    expect(result[0].usdValue).toBe(0);
  });

  it('splits 110 mints into 3 parallel Jupiter requests', async () => {
    const accounts = Array.from({ length: 110 }, (_, i) => {
      const bytes = new Uint8Array(32);
      bytes[0] = Math.floor(i / 256);
      bytes[1] = i % 256;
      return makeAccount(ACCT_BONK, new PublicKey(bytes).toBase58(), 1);
    });
    mockGetParsed.mockResolvedValue({ value: accounts } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    await solanaModule.getTrashAccounts(WALLET);
    expect(global.fetch).toHaveBeenCalledTimes(3); // ceil(110 / 50) = 3
  });

  it('throws when Jupiter returns a non-ok response', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

    await expect(solanaModule.getTrashAccounts(WALLET)).rejects.toThrow(
      'Jupiter API error: 429'
    );
  });
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `expect(global.fetch).toHaveBeenCalledWith(...)` fails — price fetching not yet implemented.

- [ ] **Step 3: Add `chunk` and `fetchPrices` to `lib/solana.ts`, wire into `getTrashAccounts`**

Add above `getTrashAccounts`:

```typescript
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    chunk(mints, 50).map(async (c) => {
      const res = await fetch(`https://price.jup.ag/v4/price?ids=${c.join(',')}`);
      if (!res.ok) throw new Error(`Jupiter API error: ${res.status}`);
      const json = await res.json() as { data: Record<string, { price: number }> };
      return json.data;
    })
  );
  return Object.assign({}, ...results) as Record<string, number>;
}
```

Replace `getTrashAccounts` (no filter yet — that's Task 5):

```typescript
export async function getTrashAccounts(walletAddress: PublicKey): Promise<TrashAccount[]> {
  const { value: accounts } = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    { programId: TOKEN_PROGRAM_ID }
  );

  const nonEmpty = accounts.filter(
    (a) => (a.account.data.parsed.info.tokenAmount.uiAmount as number) > 0
  );

  if (nonEmpty.length === 0) return [];

  const mints = nonEmpty.map((a) => a.account.data.parsed.info.mint as string);
  const prices = await fetchPrices(mints);

  return nonEmpty.map((a) => {
    const info = a.account.data.parsed.info;
    const mintStr = info.mint as string;
    const balance = info.tokenAmount.uiAmount as number;
    const pricePerToken = prices[mintStr] ?? 0;
    return {
      pubkey: a.pubkey,
      mint: new PublicKey(mintStr),
      balance,
      usdValue: balance * pricePerToken,
      pricePerToken,
    };
  });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `Tests: 7 passed, 7 total`

- [ ] **Step 5: Commit**

```bash
git add lib/solana.ts lib/__tests__/solana.test.ts
git commit -m "feat: fetch Jupiter prices in chunks of 50 with parallel requests"
```

---

### Task 5: Apply $0.10 trash threshold filter (TDD)

**Files:**
- Modify: `lib/__tests__/solana.test.ts` — add 3 tests
- Modify: `lib/solana.ts` — add `.filter()` to the return

- [ ] **Step 1: Add failing tests (inside `describe('getTrashAccounts')`, after Task 4's tests)**

```typescript
  it('excludes accounts with usdValue >= $0.10', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_USDC, MINT_USDC, 12.4)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_USDC]: { price: 1.0 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
  });

  it('includes accounts with usdValue < $0.10 with correct fields', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 142000)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_BONK]: { price: 0.0000002 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toEqual(ACCT_BONK);
    expect(result[0].mint.toBase58()).toBe(MINT_BONK);
    expect(result[0].balance).toBe(142000);
    expect(result[0].pricePerToken).toBe(0.0000002);
    expect(result[0].usdValue).toBeCloseTo(0.0284);
  });

  it('returns only trash accounts from a mixed wallet', async () => {
    mockGetParsed.mockResolvedValue({
      value: [
        makeAccount(ACCT_BONK, MINT_BONK, 142000), // $0.0284 → trash
        makeAccount(ACCT_USDC, MINT_USDC, 12.4),   // $12.40  → kept
      ],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          [MINT_BONK]: { price: 0.0000002 },
          [MINT_USDC]: { price: 1.0 },
        },
      }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toHaveLength(1);
    expect(result[0].mint.toBase58()).toBe(MINT_BONK);
  });
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `expect(received).toEqual([])` — USDC account not filtered out yet.

- [ ] **Step 3: Add `.filter()` to `getTrashAccounts` in `lib/solana.ts`**

Change the final `return nonEmpty.map(...)` to:

```typescript
  return nonEmpty
    .map((a) => {
      const info = a.account.data.parsed.info;
      const mintStr = info.mint as string;
      const balance = info.tokenAmount.uiAmount as number;
      const pricePerToken = prices[mintStr] ?? 0;
      return {
        pubkey: a.pubkey,
        mint: new PublicKey(mintStr),
        balance,
        usdValue: balance * pricePerToken,
        pricePerToken,
      };
    })
    .filter((a) => a.usdValue < 0.10);
```

- [ ] **Step 4: Run all tests — expect all PASS**

```bash
npx jest lib/__tests__/solana.test.ts --no-coverage
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 5: Commit**

```bash
git add lib/solana.ts lib/__tests__/solana.test.ts
git commit -m "feat: filter trash accounts below $0.10 USD — Trash Scanner complete"
```
