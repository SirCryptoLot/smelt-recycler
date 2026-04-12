# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Solana-based "Dust" recycling platform. Users close empty/tiny token accounts to reclaim SOL rent (~0.002 SOL per account). Dust tokens (< $0.10 USD value) are transferred to a Vault, the token account is closed, and SOL is returned to the user minus a 5% fee.

## Tech Stack

- **Frontend/Backend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Blockchain:** @solana/web3.js, @solana/spl-token
- **DEX/Swaps:** Jupiter V6
- **Storage:** Local only (no Supabase, no Vercel)

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
```

## Architecture

### Core "Atomic Recycle" Flow
1. Transfer dust tokens to the platform Vault
2. Close the user's token account (reclaims SOL rent)
3. Return SOL to user (minus 5% platform fee)

### The Liquidator
Runs locally (not as a Vercel Cron). Swaps accumulated Vault tokens to SOL via Jupiter when any single token's vault balance exceeds $10 USD.

### Key Business Rules
- Only accounts with < $0.10 USD value are flagged as recyclable "trash"
- SOL reclaim per closed account: ~0.002 SOL (Solana rent exemption minimum)
- Platform fee: 5% of reclaimed SOL
- Liquidation threshold: > $10 USD accumulated per token in Vault
- No cloud database — all state is stored locally
