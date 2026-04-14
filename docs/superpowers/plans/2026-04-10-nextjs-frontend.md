# Next.js Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 14 App Router frontend with eco-green Phantom wallet integration that auto-scans for dust accounts and displays them in a sidebar + list layout.

**Architecture:** Single `app/page.tsx` client component owns all UI state (`disconnected → scanning → results/empty/error`). Wallet adapter providers live in `app/providers.tsx` (client) + `app/layout.tsx` (server). Existing `lib/solana.ts` is consumed unchanged. Two separate Jest configs keep lib unit tests (ts-jest/node) isolated from component tests (next/jest/jsdom).

**Tech Stack:** Next.js 14, React 18, Tailwind CSS v3, @solana/wallet-adapter-react + wallets, @testing-library/react, jest-environment-jsdom

---

## File Map

| File | Role |
|---|---|
| `package.json` | Add Next.js, React, Tailwind, wallet adapter, RTL deps + scripts |
| `tsconfig.json` | Replace with Next.js-compatible config (ESM, JSX, path alias) |
| `tsconfig.jest.json` | Extends tsconfig, overrides to CommonJS for ts-jest |
| `jest.config.js` | Scope to `lib/__tests__/`, use tsconfig.jest.json |
| `jest.frontend.config.js` | next/jest config for `app/__tests__/` |
| `jest.setup.ts` | `@testing-library/jest-dom` import |
| `next.config.js` | Minimal Next.js config |
| `tailwind.config.ts` | Content paths, no custom colours (uses Tailwind emerald) |
| `postcss.config.js` | Tailwind + autoprefixer |
| `app/globals.css` | Tailwind directives |
| `app/providers.tsx` | `"use client"` — ConnectionProvider + WalletProvider + WalletModalProvider |
| `app/layout.tsx` | Server root layout, imports Providers + globals.css |
| `app/page.tsx` | `"use client"` — full UI state machine + exported `solToReclaim` |
| `app/__tests__/page.test.tsx` | RTL tests for all 5 UI states + solToReclaim |

---

### Task 1: Add Next.js, Tailwind, and wallet adapter — update all configs

**Files:**
- Modify: `package.json`
- Replace: `tsconfig.json`
- Create: `tsconfig.jest.json`
- Modify: `jest.config.js`
- Create: `jest.frontend.config.js`
- Create: `jest.setup.ts`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`

- [ ] **Step 1: Update `package.json`**

Replace the entire file:

```json
{
  "name": "recycle",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "jest",
    "test:frontend": "jest --config jest.frontend.config.js",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@solana/spl-token": "^0.4.9",
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-react-ui": "^0.9.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    "@solana/web3.js": "^1.98.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/jest": "^29.5.14",
    "@types/node": "^22",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.15",
    "ts-jest": "^29.3.1",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Replace `tsconfig.json` with Next.js-compatible version**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `tsconfig.jest.json`** (keeps ts-jest working with CommonJS)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "jsx": "react",
    "noEmit": false
  }
}
```

- [ ] **Step 4: Update `jest.config.js`** (scope to lib/ only, use tsconfig.jest.json)

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/lib/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.jest.json',
    },
  },
};
```

- [ ] **Step 5: Create `jest.frontend.config.js`**

```javascript
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/app/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
});
```

- [ ] **Step 6: Create `jest.setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 7: Create `next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 8: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 9: Create `postcss.config.js`**

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 10: Run `npm install`**

```bash
npm install
```

Expected: packages installed, no fatal errors (peer-dep warnings about React version are fine).

- [ ] **Step 11: Verify existing lib/ tests still pass**

```bash
npx jest --no-coverage
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.jest.json \
        jest.config.js jest.frontend.config.js jest.setup.ts \
        next.config.js tailwind.config.ts postcss.config.js
git commit -m "chore: add Next.js 14, Tailwind, and wallet adapter deps"
```

---

### Task 2: App shell — globals, providers, layout

**Files:**
- Create: `app/globals.css`
- Create: `app/providers.tsx`
- Create: `app/layout.tsx`

- [ ] **Step 1: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Create `app/providers.tsx`**

```typescript
'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={MAINNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 3: Create `app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '♻ Recycler',
  description: 'Reclaim your SOL from dust accounts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Start dev server and verify it loads**

```bash
npm run dev
```

Open http://localhost:3000. Expected: blank green page (no page.tsx yet), no console errors about missing modules.

Kill the server with Ctrl+C before the next step.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/providers.tsx app/layout.tsx
git commit -m "feat: add Next.js app shell with WalletAdapterProvider"
```

---

### Task 3: `page.tsx` — disconnected state + `solToReclaim` (TDD)

**Files:**
- Create: `app/__tests__/page.test.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Create the test file (will fail — module not found)**

```typescript
// app/__tests__/page.test.tsx
import { render, screen } from '@testing-library/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getTrashAccounts } from '@/lib/solana';
import Home, { solToReclaim } from '../page';
import { PublicKey } from '@solana/web3.js';

jest.mock('@solana/wallet-adapter-react');
jest.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
jest.mock('@/lib/solana', () => ({
  getTrashAccounts: jest.fn(),
}));

const mockUseWallet = useWallet as jest.Mock;
const mockGetTrashAccounts = getTrashAccounts as jest.Mock;
export const TEST_PUBKEY = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── solToReclaim ──────────────────────────────────────────────
describe('solToReclaim', () => {
  it('returns 0 for 0 accounts', () => {
    expect(solToReclaim(0)).toBe(0);
  });

  it('returns 0.002 * 0.95 per account', () => {
    expect(solToReclaim(1)).toBeCloseTo(0.0019);
    expect(solToReclaim(2)).toBeCloseTo(0.0038);
  });
});

// ── Home — disconnected ───────────────────────────────────────
describe('Home', () => {
  it('shows connect prompt and Connect button when disconnected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
      disconnect: jest.fn(),
    });
    render(<Home />);
    expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Cannot find module '../page'`

- [ ] **Step 3: Create `app/page.tsx` with disconnected state only**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, TrashAccount } from '@/lib/solana';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error';

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export default function Home() {
  const { publicKey, connected, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
    }
  }, [connected, publicKey]);

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Tests: 3 passed, 3 total` (2 solToReclaim + 1 disconnected)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: add page skeleton with disconnected state and solToReclaim"
```

---

### Task 4: `page.tsx` — scanning state (TDD)

**Files:**
- Modify: `app/__tests__/page.test.tsx` — add 1 test
- Modify: `app/page.tsx` — add useEffect scan trigger + scanning state UI

- [ ] **Step 1: Add failing test (inside `describe('Home')`, after disconnected test)**

```typescript
  it('shows scanning spinner immediately after wallet connects', () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockResolvedValue([]);
    render(<Home />);
    expect(screen.getByText('Scanning accounts…')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Unable to find an element with the text: Scanning accounts…`

- [ ] **Step 3: Add scan trigger useEffect and scanning UI to `app/page.tsx`**

Replace the `useEffect` block and add the scanning JSX. Full updated `app/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, TrashAccount } from '@/lib/solana';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error';

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export default function Home() {
  const { publicKey, connected, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      return;
    }
    scan();
  }, [connected, publicKey]);

  async function scan() {
    setStatus('scanning');
    try {
      const result = await getTrashAccounts(publicKey!);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setStatus('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        {connected && publicKey && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">WALLET</div>
            <div className="text-emerald-50 text-xs font-mono truncate">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </div>
          </div>
        )}

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">Scanning accounts…</div>
            <div className="text-emerald-400/50 text-sm">Fetching prices from Jupiter</div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: auto-scan on wallet connect, add scanning state"
```

---

### Task 5: `page.tsx` — results state (TDD)

**Files:**
- Modify: `app/__tests__/page.test.tsx` — add 2 tests
- Modify: `app/page.tsx` — add results UI + SOL stat in sidebar

- [ ] **Step 1: Add failing tests (inside `describe('Home')`, after scanning test)**

```typescript
  it('shows trash account cards and SOL stat after scan completes', async () => {
    const trashAccounts = [
      {
        pubkey: TEST_PUBKEY,
        mint: new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263'),
        balance: 142000,
        usdValue: 0.03,
        pricePerToken: 0.0000002,
      },
    ];
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockResolvedValue(trashAccounts);
    render(<Home />);
    await screen.findByText('TRASH ACCOUNTS');
    expect(screen.getByText('$0.03')).toBeInTheDocument();
    expect(screen.getByText('SOL TO RECLAIM')).toBeInTheDocument();
  });

  it('shows Recycle All button with SOL amount in results state', async () => {
    const trashAccounts = [
      {
        pubkey: TEST_PUBKEY,
        mint: new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263'),
        balance: 142000,
        usdValue: 0.03,
        pricePerToken: 0.0000002,
      },
    ];
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockResolvedValue(trashAccounts);
    render(<Home />);
    await screen.findByText('TRASH ACCOUNTS');
    expect(screen.getByRole('button', { name: /RECYCLE ALL/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Unable to find an element with the text: TRASH ACCOUNTS`

- [ ] **Step 3: Add results UI to `app/page.tsx`**

Add the SOL stat sidebar box and results JSX. Full updated `app/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, TrashAccount } from '@/lib/solana';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error';

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export default function Home() {
  const { publicKey, connected, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      return;
    }
    scan();
  }, [connected, publicKey]);

  async function scan() {
    setStatus('scanning');
    try {
      const result = await getTrashAccounts(publicKey!);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setStatus('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        {connected && publicKey && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">WALLET</div>
            <div className="text-emerald-50 text-xs font-mono truncate">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </div>
          </div>
        )}

        {status === 'results' && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">SOL TO RECLAIM</div>
            <div className="text-emerald-50 text-2xl font-bold">{sol.toFixed(3)}</div>
            <div className="text-emerald-400/50 text-xs">{accounts.length} accounts</div>
          </div>
        )}

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">Scanning accounts…</div>
            <div className="text-emerald-400/50 text-sm">Fetching prices from Jupiter</div>
          </div>
        )}

        {status === 'results' && (
          <div className="flex flex-col h-full">
            <div className="text-emerald-400 text-xs font-semibold tracking-widest mb-3">
              TRASH ACCOUNTS
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {accounts.map((account, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-950/20 px-4 py-3"
                >
                  <div>
                    <div className="text-emerald-50 text-sm font-semibold">
                      {account.mint.toBase58().slice(0, 4)}…{account.mint.toBase58().slice(-4)}
                    </div>
                    <div className="text-emerald-400/50 text-xs">
                      {account.balance.toLocaleString()} tokens
                    </div>
                  </div>
                  <div className="text-red-300 text-base font-bold">
                    ${account.usdValue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <button
                onClick={() => alert('Coming soon — recycling in Step 2')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ♻ RECYCLE ALL · +{sol.toFixed(3)} SOL
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Tests: 6 passed, 6 total`

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: results state with trash account cards and SOL stat"
```

---

### Task 6: `page.tsx` — empty + error states + Recycle All placeholder (TDD)

**Files:**
- Modify: `app/__tests__/page.test.tsx` — add 2 tests
- Modify: `app/page.tsx` — add empty + error state UI

- [ ] **Step 1: Add failing tests (inside `describe('Home')`, after results tests)**

```typescript
  it('shows empty state when no trash accounts found', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockResolvedValue([]);
    render(<Home />);
    await screen.findByText('Nothing to recycle');
    expect(screen.getByText('Your wallet is clean.')).toBeInTheDocument();
  });

  it('shows error banner with message and Try again button when scan fails', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockRejectedValue(new Error('Jupiter API error: 429'));
    render(<Home />);
    await screen.findByText('Scan failed');
    expect(screen.getByText('Jupiter API error: 429')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Unable to find an element with the text: Nothing to recycle`

- [ ] **Step 3: Add empty + error states to `app/page.tsx`**

Add inside the `<main>` block, after the `results` block (full final `app/page.tsx`):

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getTrashAccounts, TrashAccount } from '@/lib/solana';

type Status = 'disconnected' | 'scanning' | 'results' | 'empty' | 'error';

export function solToReclaim(accountCount: number): number {
  return accountCount * 0.002 * 0.95;
}

export default function Home() {
  const { publicKey, connected, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>('disconnected');
  const [accounts, setAccounts] = useState<TrashAccount[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus('disconnected');
      setAccounts([]);
      return;
    }
    scan();
  }, [connected, publicKey]);

  async function scan() {
    setStatus('scanning');
    try {
      const result = await getTrashAccounts(publicKey!);
      if (result.length === 0) {
        setStatus('empty');
      } else {
        setAccounts(result);
        setStatus('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const sol = solToReclaim(accounts.length);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg,#042f2e,#064e3b)' }}
    >
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-emerald-900/40 bg-black/20 flex flex-col p-4 gap-4">
        <div>
          <div className="text-emerald-300 font-extrabold text-lg">♻ Recycler</div>
          <div className="text-emerald-400/50 text-xs">Reclaim your SOL</div>
        </div>

        {connected && publicKey && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">WALLET</div>
            <div className="text-emerald-50 text-xs font-mono truncate">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </div>
          </div>
        )}

        {status === 'results' && (
          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-3">
            <div className="text-emerald-400 text-xs mb-1">SOL TO RECLAIM</div>
            <div className="text-emerald-50 text-2xl font-bold">{sol.toFixed(3)}</div>
            <div className="text-emerald-400/50 text-xs">{accounts.length} accounts</div>
          </div>
        )}

        <div className="mt-auto">
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-emerald-500 !text-white !font-bold !text-sm !rounded-lg" />
          ) : (
            <button
              onClick={() => disconnect()}
              className="w-full border border-emerald-700/40 text-emerald-400 text-sm rounded-lg py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col p-6">
        {status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">🔌</div>
            <div className="text-emerald-300 font-semibold">Connect your wallet</div>
            <div className="text-emerald-400/50 text-sm text-center">
              Connect Phantom to scan for dust accounts
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin" />
            <div className="text-emerald-300 font-semibold">Scanning accounts…</div>
            <div className="text-emerald-400/50 text-sm">Fetching prices from Jupiter</div>
          </div>
        )}

        {status === 'results' && (
          <div className="flex flex-col h-full">
            <div className="text-emerald-400 text-xs font-semibold tracking-widest mb-3">
              TRASH ACCOUNTS
            </div>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {accounts.map((account, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-950/20 px-4 py-3"
                >
                  <div>
                    <div className="text-emerald-50 text-sm font-semibold">
                      {account.mint.toBase58().slice(0, 4)}…{account.mint.toBase58().slice(-4)}
                    </div>
                    <div className="text-emerald-400/50 text-xs">
                      {account.balance.toLocaleString()} tokens
                    </div>
                  </div>
                  <div className="text-red-300 text-base font-bold">
                    ${account.usdValue.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <button
                onClick={() => alert('Coming soon — recycling in Step 2')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ♻ RECYCLE ALL · +{sol.toFixed(3)} SOL
              </button>
            </div>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="text-4xl">✅</div>
            <div className="text-emerald-300 font-semibold">Nothing to recycle</div>
            <div className="text-emerald-400/50 text-sm">Your wallet is clean.</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 max-w-md text-center">
              <div className="text-red-300 font-semibold mb-1">Scan failed</div>
              <div className="text-red-300/70 text-sm">{error}</div>
            </div>
            <button
              onClick={scan}
              className="border border-emerald-700/40 text-emerald-400 text-sm rounded-lg px-4 py-2 hover:bg-emerald-900/30 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run all frontend tests — confirm 8 pass**

```bash
npx jest --config jest.frontend.config.js --no-coverage
```

Expected: `Tests: 8 passed, 8 total`

- [ ] **Step 5: Run lib tests — confirm still 10 pass**

```bash
npx jest --no-coverage
```

Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: empty and error states — Next.js frontend complete"
```
