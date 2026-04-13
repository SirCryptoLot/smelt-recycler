# Mobile Wallet Connect Modal — Design Spec

**Date:** 2026-04-14
**Status:** Approved

## Problem

On mobile external browsers (Chrome, Safari), the current wallet connect flow only offers Phantom and Solflare deep links. Backpack and Jupiter Mobile are missing. Additionally, the detection logic (`isInWalletBrowser`) only checks for Phantom and Solflare — Backpack is undetected even when the user is already inside its in-app browser.

## Goals

- Detect all 4 major Solana wallets on mobile: Phantom, Backpack, Solflare, Jupiter Mobile
- If already inside a wallet's in-app browser → surface that wallet prominently with a direct Connect button
- If in an external browser → show all 4 wallets as deep-link buttons
- Desktop experience unchanged (still uses `WalletMultiButton`)

## Detection Logic

Run once on mount (client-side only). Check `window` injections:

| Wallet | Detection |
|--------|-----------|
| Phantom | `window.phantom?.solana?.isPhantom === true` |
| Backpack | `window.backpack?.isBackpack === true` |
| Solflare | `window.solflare?.isSolflare === true` |
| Jupiter | `window.jupiter?.isMobile === true` |

`isMobileDevice()` — unchanged, checks `navigator.userAgent` for android/iphone/ipad/ipod.

A "mobile external browser" is: `isMobileDevice() && no wallet detected`.

## Deep Link URLs

All use `encodeURIComponent(window.location.href)` as `{url}`.

| Wallet | Deep Link |
|--------|-----------|
| Phantom | `https://phantom.app/ul/browse/{url}?ref={url}` |
| Backpack | `https://backpack.app/ul/browse/{url}?ref={url}` |
| Solflare | `https://solflare.com/ul/v1/browse/{url}?ref={url}` |
| Jupiter | `https://jup.ag/ul/browse/{url}?ref={url}` |

## UI States

### State A — Inside a wallet's in-app browser

Bottom sheet (triggered by "Connect" button in drawer/nav):
- Detected wallet shown at top with brand color highlight and a **Connect** button
- Remaining 3 wallets listed below as secondary "Open app →" deep-link rows
- Sheet animates up from bottom, backdrop closes on tap

### State B — External mobile browser

Bottom sheet shows all 4 wallets as full-width deep-link buttons with brand colors:
- Phantom (purple `#7c3aed`)
- Backpack (pink `#e879f9`)
- Solflare (orange `#ff6b35`)
- Jupiter (sky `#38bdf8`)

Header copy: "Open this page in your wallet app to connect"

## Component Architecture

### New: `components/WalletConnectSheet.tsx`

Self-contained bottom-sheet component. Props:
```ts
interface WalletConnectSheetProps {
  open: boolean;
  onClose: () => void;
}
```

Internally:
- Detects wallet context on mount (one-time `useEffect`)
- Renders State A or State B based on detection result
- Handles backdrop click + close button

### Modified: `app/providers.tsx`

Add `BackpackWalletAdapter` to the wallets array alongside existing Phantom and Solflare adapters.

```ts
import { PhantomWalletAdapter, SolflareWalletAdapter, BackpackWalletAdapter } from '@solana/wallet-adapter-wallets';

const wallets = useMemo(() => [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new BackpackWalletAdapter(),
], []);
```

### Modified: `components/AppShell.tsx`

- Remove `isInWalletBrowser()`, `buildDeepLink()`, `mobileExternalBrowser` state
- Add `walletSheetOpen` boolean state
- Replace current mobileExternalBrowser deep-link section in drawer footer with `<WalletConnectSheet>`
- Replace top-nav "Open Wallet" `<a>` deep-link button with a `<button>` that opens the sheet

Desktop `WalletMultiButton` is untouched.

## Out of Scope

- Desktop wallet detection changes
- WalletConnect / QR code flow
- Any wallet beyond the 4 listed
