# Trash Scanner — Design Spec

**Date:** 2026-04-09
**File:** `lib/solana.ts`
**Status:** Approved

---

## Overview

A helper function `getTrashAccounts` that fetches all SPL token accounts for a given wallet, prices them via the Jupiter Price API, and returns only those whose USD value is below the $0.10 "trash" threshold. This is Step 1 of the atomic recycle flow — its output feeds directly into `createTransferInstruction` and `createCloseAccountInstruction` in Step 2.

---

## Function Signature

```typescript
export async function getTrashAccounts(
  walletAddress: PublicKey
): Promise<TrashAccount[]>
```

- `walletAddress` — any valid Solana `PublicKey`; the caller provides it at runtime
- Connection is created internally as a module-level singleton pointing to `https://api.mainnet-beta.solana.com`

---

## Return Type

```typescript
export interface TrashAccount {
  pubkey: PublicKey;       // token account address → createCloseAccountInstruction
  mint: PublicKey;         // token mint → createTransferInstruction to vault
  balance: number;         // UI amount (decimals applied)
  usdValue: number;        // balance × pricePerToken
  pricePerToken: number;   // from Jupiter; 0 if unlisted
}
```

---

## Data Flow

1. **`getTokenAccountsByOwner`** — RPC call to mainnet, filtered by `TOKEN_PROGRAM_ID`
2. **Parse accounts** — decode each with `AccountLayout`, compute UI balance using mint decimals
3. **Filter zero-balance** — skip accounts with `balance === 0` (already empty, no dust to reclaim)
4. **Chunk mints into groups of 50** — stays within Jupiter's URL length limits
5. **`Promise.all` price requests** — one `GET /v4/price?ids=...` per chunk, in parallel
6. **Map prices** — join price data back to accounts; unlisted mints get `pricePerToken: 0`
7. **Filter `usdValue < 0.10`** — return only trash accounts

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Mint has no Jupiter price | `pricePerToken: 0`, `usdValue: 0` — treated as trash |
| Jupiter API network error | Throw — let the caller decide whether to retry or surface to the user |
| RPC error fetching accounts | Throw — unrecoverable without a working connection |
| Wallet has zero token accounts | Return `[]` — not an error |

---

## Constraints

- RPC: `https://api.mainnet-beta.solana.com` (default public endpoint, no API key)
- No Supabase, no Vercel — all logic runs locally in the Next.js dev server
- Chunk size: 50 mints per Jupiter request
- Trash threshold: `< $0.10` USD (strict less-than, not ≤)
