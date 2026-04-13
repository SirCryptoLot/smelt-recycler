# Mobile Wallet Connect Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 2-wallet deep-link buttons with a bottom-sheet modal that auto-detects Phantom, Backpack, Solflare, and Jupiter Mobile on mobile.

**Architecture:** A new `WalletConnectSheet` component handles all detection and rendering. `AppShell` just tracks open/close state and renders the sheet. No changes to `providers.tsx` — wallet-standard (already in `@solana/wallet-adapter-react` v0.15.39) auto-discovers Backpack on desktop.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `components/WalletConnectSheet.tsx` | **Create** | Bottom-sheet with wallet detection + both UI states |
| `components/AppShell.tsx` | **Modify** | Remove old helpers, wire up WalletConnectSheet |

---

### Task 1: Create `components/WalletConnectSheet.tsx`

**Files:**
- Create: `components/WalletConnectSheet.tsx`

- [ ] **Step 1: Create the file with detection logic and types**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

type DetectedWallet = 'phantom' | 'backpack' | 'solflare' | 'jupiter' | null;

const WALLETS = [
  {
    id: 'phantom' as const,
    name: 'Phantom',
    color: '#7c3aed',
    emoji: '👻',
    deepLink: (url: string) => `https://phantom.app/ul/browse/${url}?ref=${url}`,
  },
  {
    id: 'backpack' as const,
    name: 'Backpack',
    color: '#e879f9',
    emoji: '🎒',
    deepLink: (url: string) => `https://backpack.app/ul/browse/${url}?ref=${url}`,
  },
  {
    id: 'solflare' as const,
    name: 'Solflare',
    color: '#ff6b35',
    emoji: '🔆',
    deepLink: (url: string) => `https://solflare.com/ul/v1/browse/${url}?ref=${url}`,
  },
  {
    id: 'jupiter' as const,
    name: 'Jupiter',
    color: '#38bdf8',
    emoji: '🪐',
    deepLink: (url: string) => `https://jup.ag/ul/browse/${url}?ref=${url}`,
  },
];

function detectWallet(): DetectedWallet {
  if (typeof window === 'undefined') return null;
  if ((window as any).phantom?.solana?.isPhantom) return 'phantom';
  if ((window as any).backpack?.isBackpack) return 'backpack';
  if ((window as any).solflare?.isSolflare) return 'solflare';
  if ((window as any).jupiter?.isMobile) return 'jupiter';
  return null;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function encodedHref(): string {
  return encodeURIComponent(
    typeof window !== 'undefined' ? window.location.href : 'https://recycler.app'
  );
}

interface WalletConnectSheetProps {
  open: boolean;
  onClose: () => void;
}

export function WalletConnectSheet({ open, onClose }: WalletConnectSheetProps) {
  const { select, wallets, connect } = useWallet();
  const [detected, setDetected] = useState<DetectedWallet>(null);
  const [isExternalMobile, setIsExternalMobile] = useState(false);

  useEffect(() => {
    const d = detectWallet();
    setDetected(d);
    setIsExternalMobile(isMobile() && d === null);
  }, []);

  if (!open) return null;

  const url = encodedHref();
  const detectedWallet = WALLETS.find((w) => w.id === detected);
  const otherWallets = WALLETS.filter((w) => w.id !== detected);

  function handleConnect() {
    if (!detectedWallet) return;
    const adapter = wallets.find(
      (w) => w.adapter.name.toLowerCase() === detectedWallet.name.toLowerCase()
    );
    if (adapter) {
      select(adapter.adapter.name);
      connect().catch(() => {});
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-5 pb-8 animate-slide-up">
        {/* Drag handle */}
        <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="font-bold text-gray-900 text-base mb-1">Connect Wallet</div>

        {isExternalMobile ? (
          /* State B — external browser: show all 4 as deep links */
          <>
            <p className="text-xs text-gray-500 mb-4">
              Open this page in your wallet app to connect
            </p>
            <div className="flex flex-col gap-2.5">
              {WALLETS.map((w) => (
                <a
                  key={w.id}
                  href={w.deepLink(url)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-white font-semibold text-sm"
                  style={{ backgroundColor: w.color }}
                >
                  <span className="text-lg">{w.emoji}</span>
                  <span className="flex-1">Open in {w.name}</span>
                  <span className="text-xs opacity-80">→</span>
                </a>
              ))}
            </div>
          </>
        ) : detectedWallet ? (
          /* State A — inside a wallet browser: highlight detected, list others */
          <>
            <p className="text-xs text-gray-500 mb-4">
              {detectedWallet.name} detected
            </p>

            {/* Detected wallet — prominent */}
            <button
              onClick={handleConnect}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-3 font-semibold text-sm border-2 text-white"
              style={{ backgroundColor: detectedWallet.color, borderColor: detectedWallet.color }}
            >
              <span className="text-lg">{detectedWallet.emoji}</span>
              <span className="flex-1 text-left">Connect {detectedWallet.name}</span>
              <span className="text-xs opacity-80 font-medium px-2 py-0.5 bg-white/20 rounded-full">Detected</span>
            </button>

            {/* Other wallets — secondary deep links */}
            <p className="text-[11px] text-gray-400 mb-2">Other wallets</p>
            <div className="flex flex-col gap-1.5">
              {otherWallets.map((w) => (
                <a
                  key={w.id}
                  href={w.deepLink(url)}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5 bg-gray-50 border border-gray-100 text-sm text-gray-600"
                >
                  <span className="text-base">{w.emoji}</span>
                  <span className="flex-1 font-medium">{w.name}</span>
                  <span className="text-xs text-gray-400">Open app →</span>
                </a>
              ))}
            </div>
          </>
        ) : (
          /* Desktop fallback (shouldn't normally show, WalletMultiButton used instead) */
          <p className="text-sm text-gray-500">Use the Connect button above.</p>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the slide-up animation to `app/globals.css`**

Open `app/globals.css` and add before the last line:

```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.25s ease;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit --skipLibCheck 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
cd /c/recycle && git add components/WalletConnectSheet.tsx app/globals.css
git commit -m "feat: add WalletConnectSheet with Phantom/Backpack/Solflare/Jupiter detection"
```

---

### Task 2: Wire `WalletConnectSheet` into `AppShell`

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Remove old helpers and state, add walletSheetOpen state**

In `components/AppShell.tsx`, replace the top section (lines 12–35 approx) — the `isInWalletBrowser`, `isMobileDevice`, and `buildDeepLink` functions — and remove the `mobileExternalBrowser` state:

**Remove these functions entirely:**
```tsx
/** Returns true if running inside Phantom or Solflare's in-app browser (wallet extension injected). */
function isInWalletBrowser(): boolean { ... }

/** Returns true if on a mobile device (Android or iOS). */
function isMobileDevice(): boolean { ... }

function buildDeepLink(wallet: 'phantom' | 'solflare'): string { ... }
```

**Remove from inside `AppShell` component:**
```tsx
const [mobileExternalBrowser, setMobileExternalBrowser] = useState(false);
```

**Remove from the mount `useEffect`:**
```tsx
setMobileExternalBrowser(isMobileDevice() && !isInWalletBrowser());
```

**Add import at top of file:**
```tsx
import { WalletConnectSheet } from './WalletConnectSheet';
```

**Add new state inside `AppShell` component (after `drawerOpen`):**
```tsx
const [walletSheetOpen, setWalletSheetOpen] = useState(false);
```

- [ ] **Step 2: Replace the drawer footer wallet section**

Find the drawer footer section (inside the mobile drawer, lines ~142–187). Replace the entire `connected ? ... : mobileExternalBrowser ? ... : <WalletMultiButton>` block with:

```tsx
{connected && publicKey ? (
  <>
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-3 space-y-1.5">
      <div className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Wallet</div>
      <div className="text-gray-700 text-xs font-mono">{shortAddr(publicKey.toBase58())}</div>
      <div className="flex justify-between text-xs pt-1">
        <span className="text-gray-400">SMELT</span>
        <span className="text-gray-700 font-semibold">{(Number(smeltBalance) / 1e9).toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">NAV</span>
        <span className="text-indigo-500 font-semibold">{nav} SOL</span>
      </div>
    </div>
    <button
      onClick={() => disconnect()}
      className="w-full text-gray-500 text-sm font-medium rounded-xl py-2.5 border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-all"
    >
      Disconnect
    </button>
  </>
) : (
  <button
    onClick={() => { setDrawerOpen(false); setWalletSheetOpen(true); }}
    className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl py-3 transition-colors"
  >
    Connect Wallet
  </button>
)}
```

- [ ] **Step 3: Replace the top-nav mobile connect button**

Find the mobile connect button in the top nav (lines ~261–276). Replace the entire `connected ? ... : mobileExternalBrowser ? ... : <button>` block with:

```tsx
{connected ? (
  <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
    Connected
  </span>
) : (
  <button
    onClick={() => setWalletSheetOpen(true)}
    className="text-xs font-semibold text-white bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-full transition-colors"
  >
    Connect
  </button>
)}
```

- [ ] **Step 4: Add `<WalletConnectSheet>` to the JSX**

Just before the closing `</div>` of the outermost wrapper (before `{/* TOP NAV */}`), add:

```tsx
{mounted && (
  <WalletConnectSheet
    open={walletSheetOpen}
    onClose={() => setWalletSheetOpen(false)}
  />
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /c/recycle && npx tsc --noEmit --skipLibCheck 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd /c/recycle && git add components/AppShell.tsx
git commit -m "feat: wire WalletConnectSheet into AppShell, remove old deep-link helpers"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

```bash
cd /c/recycle && npm run dev
```

- [ ] **Step 2: Test on desktop**

Open http://localhost:3000. Click "Connect" in the top nav — should open the standard `WalletMultiButton` modal (unchanged). Phantom/Backpack/Solflare should appear if extensions are installed.

- [ ] **Step 3: Test mobile simulation in browser DevTools**

Open DevTools → toggle device toolbar (mobile emulation). Refresh page. Click "Connect" button in top nav — should open the `WalletConnectSheet` bottom sheet showing State B (4 deep-link buttons), since no wallet is injected in DevTools.

- [ ] **Step 4: Test wallet-in-browser simulation**

In DevTools console, run:
```js
window.phantom = { solana: { isPhantom: true } };
```
Then hard-refresh and click Connect — should show State A with Phantom highlighted and "Connect Phantom" button.

- [ ] **Step 5: Commit verification note (no code change)**

If all looks good, no commit needed. If any fixes were required during testing, commit them with:
```bash
git add -p && git commit -m "fix: wallet sheet visual corrections"
```
