---
name: solana-recycler
description: This skill should be used when the user asks to "recycle token accounts", "build the atomic recycle transaction", "close dust accounts", "calculate recycling fees", "check if a token is trash", "value a token", or "swap via Jupiter". Covers the full atomic transaction flow, fee math, and token valuation for the Solana recycling platform.
version: 0.1.0
---

# Solana Recycling Procedures

A Solana-based dust recycling platform that closes empty/tiny token accounts to reclaim SOL rent. This skill covers the atomic transaction construction, fee calculation, and token valuation logic.

## Creating the Atomic Transaction

Always add instructions in this exact order within a single transaction:

1. `createTransferInstruction` — Move dust assets to the Vault.
2. `createCloseAccountInstruction` — Reclaim the 0.002 SOL rent deposit.

Bundling both instructions atomically prevents a partial-execution state where tokens are transferred but the account remains open (and rent is never reclaimed).

## Fee Calculation

- Platform fee: 5% of the reclaimed SOL rent per account.
- Formula per account: `0.002 SOL × 0.05 = 0.0001 SOL`
- Deduct this from the SOL returned to the user after closing.

## Token Valuation ("Trash" Check)

Use the Jupiter Price API to determine whether a token qualifies as recyclable trash (< $0.10 USD value).

See `references/jupiter-api.md` for the endpoint details and response shape.

## Additional Resources

### Reference Files

- **`references/jupiter-api.md`** — Jupiter Price API endpoint, query format, and response parsing.
