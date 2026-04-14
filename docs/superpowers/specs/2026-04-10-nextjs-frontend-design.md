# Next.js Frontend Design Spec

**Date:** 2026-04-10
**Status:** Approved

---

## Overview

A Next.js 14 (App Router) single-page frontend for the Solana dust recycler. Users connect their Phantom wallet, the app auto-scans for trash accounts (< $0.10 USD) using the existing `getTrashAccounts` helper, and displays them in a sidebar + list layout with a "Recycle All" button (placeholder — wired in Step 2).

---

## Visual Style

- **Theme:** Eco Green — deep green background (`#042f2e` → `#064e3b` gradient), emerald accents (`#6ee7b7`, `#10b981`), red for trash values (`#fca5a5`)
- **Font:** System sans-serif via Tailwind defaults
- **Layout:** Sidebar (fixed left) + scrollable main content area

---

## File Structure

```
app/
  layout.tsx       — root layout, WalletAdapterProvider + Tailwind globals
  page.tsx         — single "use client" component, owns all UI state
  globals.css      — Tailwind base + eco-green CSS variables
lib/
  solana.ts        — already built ✓
```

No additional routes. No server components beyond the root layout shell.

---

## Wallet Connection

- Library: `@solana/wallet-adapter-react` + `@solana/wallet-adapter-phantom`
- `layout.tsx` wraps the app in `WalletAdapterProvider` and `WalletModalProvider`
- `page.tsx` reads `useWallet()` — `publicKey`, `connected`, `disconnect`
- Connect/disconnect button lives in the sidebar

---

## UI States

`page.tsx` manages a single `status` state variable:

| Status | Sidebar | Main area |
|---|---|---|
| `disconnected` | App name + Connect button | "🔌 Connect your wallet" prompt |
| `scanning` | App name + wallet address + Disconnect | Spinning loader + "Scanning accounts…" |
| `results` | Address + SOL-to-reclaim stat + Disconnect | Trash account cards + Recycle All button |
| `empty` | Address + Disconnect | "✅ Nothing to recycle" |
| `error` | Address + Disconnect | Red error banner with message |

**State transitions:**
- `disconnected` → `scanning`: wallet `connected` flips to true (useEffect)
- `scanning` → `results` / `empty` / `error`: `getTrashAccounts` resolves or rejects
- any → `disconnected`: wallet disconnects

---

## Sidebar

Fixed-width (`w-40`), always visible. Contents:

1. App name: **♻ Recycler** + tagline "Reclaim your SOL"
2. Wallet box (shown when connected): truncated address `FhG6…f8Mo`
3. SOL stat box (shown on `results`): "SOL TO RECLAIM" + value + account count
4. Connect / Disconnect button at bottom

---

## Main Content Area

### `disconnected`
Centered: plug emoji + "Connect your wallet" + subtitle.

### `scanning`
Centered: CSS spinner + "Scanning accounts…" + "Fetching prices from Jupiter".

### `results`
- Section header: "TRASH ACCOUNTS"
- One card per `TrashAccount`: token name (mint truncated if unknown) | balance | USD value in red
- Sticky footer: green "♻ RECYCLE ALL · +X.XXX SOL" button

### `empty`
Centered: checkmark + "Nothing to recycle" + "Your wallet is clean."

### `error`
Red-tinted banner: error message + "Try again" button (re-triggers scan).

---

## Data Flow

```
wallet connects
  → useEffect fires → setStatus('scanning')
  → getTrashAccounts(publicKey)
      ├── accounts.length > 0  → setStatus('results'), setAccounts(accounts)
      ├── accounts.length === 0 → setStatus('empty')
      └── throws               → setStatus('error'), setError(err.message)

wallet disconnects
  → setStatus('disconnected'), setAccounts([])

"Recycle All" clicked
  → toast / alert: "Coming soon — recycling in Step 2"
```

---

## SOL Reclaim Calculation

Displayed in the sidebar stat box:

```ts
const solToReclaim = trashAccounts.length * 0.002 * 0.95; // 5% fee deducted
```

---

## Dependencies to Add

```bash
npm install next react react-dom
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
            @solana/wallet-adapter-phantom @solana/wallet-adapter-base
npm install -D tailwindcss postcss autoprefixer @types/react @types/react-dom
```

---

## Constraints

- Local only — no Supabase, no Vercel deployment config
- Dev server: `npm run dev` (Next.js default port 3000)
- "Recycle All" is a placeholder — no transaction built yet
- Wallet adapter modal uses default styling, overridden to match green theme
