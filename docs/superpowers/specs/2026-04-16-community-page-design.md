# Community Page Redesign — Design Spec

**Goal:** Clean up the community page by removing the unimplemented prize system, adding a SOL donation card, and adding a "Key Addresses" transparency section to the how-it-works page.

**Architecture:** Two pages change — `app/community/page.tsx` (rewrite) and `app/how-it-works/page.tsx` (add section). One new API route: `POST /api/donate`. No new data files — writes to existing `donations.json` via `lib/donations.ts`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, `@solana/web3.js` for SOL transfer.

---

## Page Structure — `/community`

Single scroll, top to bottom. Three sections.

### Section 1 — Ecosystem Health

Unchanged from current. 5-card grid (2×2 on mobile, 5-col on desktop):

| Label | Source | Accent |
|-------|--------|--------|
| Wallets cleaned | `eco.totalWallets` | no |
| Accounts closed | `eco.totalAccountsClosed` | no |
| SOL unlocked | `eco.totalSolReclaimed.toFixed(2) + " SOL"` | no |
| SMELT minted | `eco.totalSmeltMinted.toLocaleString()` | green |
| SOL donated | `totalSolDonated.toFixed(4) + " SOL"` | green |

Data from `/api/ecosystem` and `/api/donations` (totalSolDonated field).

Remove the `"All-time · Solana mainnet"` sub-label from the section header — just "Ecosystem Health".

### Section 2 — Donate to the pool

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
  <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">
    Donate to the pool
  </div>
  <p className="text-sm text-gray-500 mb-4">
    Send SOL directly to the distribution pool. It will appear in the next epoch's distribution to stakers.
  </p>

  {/* Preset pills */}
  <div className="flex gap-2 mb-3">
    {[0.1, 0.5, 1].map(amt => (
      <button
        key={amt}
        onClick={() => setDonateAmount(String(amt))}
        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors
          ${donateAmount === String(amt)
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}
      >
        {amt} SOL
      </button>
    ))}
  </div>

  {/* Custom amount */}
  <input
    type="number"
    min="0.001"
    step="0.001"
    placeholder="Custom amount"
    value={donateAmount}
    onChange={e => setDonateAmount(e.target.value)}
    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-3
               focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
  />

  {/* Button */}
  {!publicKey ? (
    <div className="text-xs text-gray-400 text-center py-2">Connect your wallet to donate.</div>
  ) : (
    <button
      onClick={handleDonate}
      disabled={donating || !donateAmount || Number(donateAmount) <= 0}
      className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold
                 rounded-xl py-2.5 text-sm transition-colors"
    >
      {donating ? 'Sending…' : 'Donate'}
    </button>
  )}

  {donateSuccess && (
    <div className="mt-3 text-sm text-green-700 font-semibold text-center">
      Thank you! Your donation was recorded.
    </div>
  )}
  {donateError && (
    <div className="mt-3 text-sm text-red-500 text-center">{donateError}</div>
  )}
</div>
```

**State:** `donateAmount: string`, `donating: boolean`, `donateSuccess: boolean`, `donateError: string`

**`handleDonate` flow:**
1. Parse `amountSol = parseFloat(donateAmount)` — bail if NaN or ≤ 0
2. Convert to lamports: `amountLamports = Math.round(amountSol * 1e9)`
3. Build transaction: `SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: VAULT_PUBKEY, lamports: amountLamports })`
4. Get `{ blockhash }` from `connection.getLatestBlockhash()`
5. Build `VersionedTransaction` with `TransactionMessage` (V0)
6. `sendTransaction(tx, connection)` — wallet adapter handles signing
7. `await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })`
8. POST `/api/donate` with `{ wallet: publicKey.toBase58(), amount: amountSol }`
9. On success: set `donateSuccess = true`, clear `donateAmount`, reset after 4s
10. On error: set `donateError` to message

Imports needed: `SystemProgram`, `TransactionMessage`, `VersionedTransaction` from `@solana/web3.js`; `VAULT_PUBKEY` from `@/lib/constants`; `useConnection` from `@solana/wallet-adapter-react`.

### Section 3 — Leaderboard

Identical to current except:
- Remove `const PRIZES = [250, 150, 100]`
- Remove "Prize" column from desktop table header and body
- Remove prize badge from mobile card rows
- Keep weekly/all-time tab toggle
- Keep "you" highlight for connected wallet
- Keep "Not in top 20" footer row

---

## New API Route — `POST /api/donate`

**File:** `app/api/donate/route.ts`

```typescript
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { loadDonations, saveDonations } from '@/lib/donations';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { wallet, amount } = await req.json() as { wallet: string; amount: number };
    if (!wallet || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }
    const donations = loadDonations();
    donations.push({
      date: new Date().toISOString(),
      wallet,
      solDonated: amount,
      distributed: false,
    });
    saveDonations(donations);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record donation' }, { status: 500 });
  }
}
```

`saveDonations` must be exported from `lib/donations.ts` — check if it exists; if not, add it (writes array back to JSON file using same pattern as other save functions in the codebase).

---

## How It Works — Key Addresses Section

New section added to `app/how-it-works/page.tsx`, placed **between the Treasury section and the FAQ**.

```tsx
<section className="space-y-3">
  <h2 className="text-lg font-semibold text-gray-900">Key addresses</h2>
  <p className="text-gray-500 text-sm leading-relaxed">
    All platform addresses are public and verifiable on-chain. Click any address to copy, or open in Solscan.
  </p>
  {([
    ['SMELT Mint',      'SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8'],
    ['Platform Vault',  'DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z'],
    ['Staking Pool',    '9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok'],
    ['Admin',           '5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5'],
  ] as [string, string][]).map(([label, addr]) => (
    <AddressRow key={addr} label={label} address={addr} />
  ))}
</section>
```

`AddressRow` is a small client component (defined inline in the file, not exported):

```tsx
'use client';
function AddressRow({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-0.5">{label}</div>
        <div className="text-sm font-mono text-gray-700">{address.slice(0, 6)}…{address.slice(-4)}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={copy}
          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
        >
          Solscan ↗
        </a>
      </div>
    </div>
  );
}
```

Because `AddressRow` uses `useState`, `app/how-it-works/page.tsx` must add `'use client'` at the top.

---

## File Summary

| File | Action |
|------|--------|
| `app/community/page.tsx` | Rewrite — remove prizes, add donate card |
| `app/api/donate/route.ts` | Create — POST endpoint, records donation |
| `lib/donations.ts` | Modify — add `saveDonations` export if missing |
| `app/how-it-works/page.tsx` | Modify — add `'use client'`, add Key Addresses section |

---

## Out of Scope

- On-chain verification that the transfer actually happened (server trusts the client POST)
- Minimum/maximum donation limits beyond `> 0`
- Donation leaderboard or donor list on community page (those are on Treasury)
- Social links section
