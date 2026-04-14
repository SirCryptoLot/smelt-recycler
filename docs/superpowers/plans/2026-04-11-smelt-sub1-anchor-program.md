# SMELT Sub-project 1: Token + Anchor Staking Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the SMELT SPL token (1B fixed supply) and deploy an Anchor staking program that lets users lock/unlock SMELT with a GlobalState PDA tracking total staked across all users.

**Architecture:** Standard SPL token created via a TypeScript script; Anchor program (`smelt_staking`) with three instructions — `initialize`, `stake`, `unstake`. Program holds staked SMELT in a vault ATA owned by the GlobalState PDA. No lock period. Admin backend and frontend both read this program in sub-projects 2 and 3.

**Tech Stack:** Rust 1.79+, Anchor 0.30.1, @coral-xyz/anchor, @solana/spl-token, ts-mocha, Chai

> ⚠️ **Windows users:** Run all Anchor/Rust commands inside WSL2 (Ubuntu). The project lives at `/mnt/c/recycle` from inside WSL2. The Next.js dev server can still run from Windows Git Bash in parallel.

---

## File Map

| File | Purpose |
|---|---|
| `Anchor.toml` | Anchor workspace config |
| `Cargo.toml` | Rust workspace root |
| `programs/smelt_staking/Cargo.toml` | Program crate config |
| `programs/smelt_staking/src/lib.rs` | Program entry point + declare_id |
| `programs/smelt_staking/src/state.rs` | GlobalState + StakeAccount structs |
| `programs/smelt_staking/src/errors.rs` | StakingError enum |
| `programs/smelt_staking/src/instructions/mod.rs` | Re-exports |
| `programs/smelt_staking/src/instructions/initialize.rs` | Initialize context + handler |
| `programs/smelt_staking/src/instructions/stake.rs` | Stake context + handler |
| `programs/smelt_staking/src/instructions/unstake.rs` | Unstake context + handler |
| `tests/smelt_staking.ts` | Anchor TypeScript tests (Mocha) |
| `scripts/create-smelt-token.ts` | One-time: mint 1B SMELT to admin |
| `lib/constants.ts` | All shared addresses + emission config |
| `data/keypairs/admin.json` | Admin keypair (gitignored) |
| `data/keypairs/vault.json` | Vault keypair (gitignored) |

---

## Task 1: Install prerequisites + init Anchor workspace

**Files:**
- Create: `Anchor.toml`
- Create: `Cargo.toml`
- Create: `programs/smelt_staking/Cargo.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Install Rust (WSL2)**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
rustc --version
# Expected: rustc 1.79.x or newer
```

- [ ] **Step 2: Install Solana CLI (WSL2)**

```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
solana --version
# Expected: solana-cli 1.18.26
```

- [ ] **Step 3: Install Anchor (WSL2)**

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
anchor --version
# Expected: anchor-cli 0.30.1
```

- [ ] **Step 4: Create Anchor.toml at project root**

```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
smelt_staking = "11111111111111111111111111111111"

[programs.devnet]
smelt_staking = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "data/keypairs/admin.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.anchor.json -t 1000000 tests/**/*.ts"
```

- [ ] **Step 5: Create Cargo.toml workspace at project root**

```toml
[workspace]
members = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
```

- [ ] **Step 6: Create programs/smelt_staking/Cargo.toml**

```toml
[package]
name = "smelt-staking"
version = "0.1.0"
description = "SMELT staking program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "smelt_staking"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl = { version = "0.30.1", features = ["token", "associated_token"] }
```

- [ ] **Step 7: Create tsconfig.anchor.json (separate from Next.js tsconfig)**

```json
{
  "compilerOptions": {
    "types": ["mocha", "chai"],
    "typeRoots": ["./node_modules/@types"],
    "lib": ["es2015"],
    "module": "commonjs",
    "target": "es6",
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 8: Create data/keypairs/ directory + add to .gitignore**

```bash
mkdir -p data/keypairs
```

Add to `.gitignore`:
```
data/keypairs/
data/liquidations.json
data/distributions.json
target/
```

- [ ] **Step 9: Install test dependencies**

```bash
npm install --save-dev ts-mocha @types/chai @types/mocha chai
npm install @coral-xyz/anchor
```

- [ ] **Step 10: Commit**

```bash
git add Anchor.toml Cargo.toml programs/ tsconfig.anchor.json .gitignore package.json package-lock.json
git commit -m "chore: init Anchor workspace for smelt_staking program"
```

---

## Task 2: Create keypairs + SMELT token creation script

**Files:**
- Create: `scripts/create-smelt-token.ts`
- Create: `lib/constants.ts`

- [ ] **Step 1: Create admin + vault keypairs**

```bash
mkdir -p data/keypairs
solana-keygen new --no-bip39-passphrase -o data/keypairs/admin.json
solana-keygen new --no-bip39-passphrase -o data/keypairs/vault.json
solana address -k data/keypairs/admin.json
# Save this address — it's your ADMIN_PUBKEY
solana address -k data/keypairs/vault.json
# Save this address — it's your VAULT_PUBKEY
```

- [ ] **Step 2: Fund admin on devnet**

```bash
solana airdrop 2 $(solana address -k data/keypairs/admin.json) --url devnet
solana balance $(solana address -k data/keypairs/admin.json) --url devnet
# Expected: 2 SOL
```

- [ ] **Step 3: Create scripts/create-smelt-token.ts**

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const RPC = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const DECIMALS = 9;
// 1 billion tokens × 10^9 raw units
const TOTAL_SUPPLY = 1_000_000_000_000_000_000n;

async function main() {
  const keypairPath = path.join('data', 'keypairs', 'admin.json');
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );

  const connection = new Connection(RPC, 'confirmed');
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 0.05 * 1e9) {
    throw new Error(`Admin needs SOL. Run: solana airdrop 2 ${adminKeypair.publicKey.toBase58()} --url devnet`);
  }

  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);

  const mint = await createMint(
    connection,
    adminKeypair,
    adminKeypair.publicKey, // mint authority
    null,                   // freeze authority (none)
    DECIMALS,
  );
  console.log('✓ SMELT mint:', mint.toBase58());

  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection, adminKeypair, mint, adminKeypair.publicKey
  );

  await mintTo(connection, adminKeypair, mint, adminAta.address, adminKeypair, TOTAL_SUPPLY);
  console.log('✓ Minted 1,000,000,000 SMELT');
  console.log('\n→ Update lib/constants.ts: SMELT_MINT =', mint.toBase58());
}

main().catch(console.error);
```

- [ ] **Step 4: Create lib/constants.ts**

```typescript
import { PublicKey } from '@solana/web3.js';

// Updated after running scripts/create-smelt-token.ts
export const SMELT_MINT = new PublicKey('11111111111111111111111111111111');
// Updated after running: anchor deploy
export const STAKING_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

// Updated to match data/keypairs/vault.json pubkey
export const VAULT_PUBKEY = new PublicKey('DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z');

export const LIQUIDATION_THRESHOLD_USD = 10;
export const TRASH_THRESHOLD_USD = 0.10;
export const PLATFORM_FEE_BPS = 500; // 5%
export const STAKING_BOOST = 1.5;

// Emission schedule — set PROGRAM_START_TIMESTAMP to Date.now() at launch
export const PROGRAM_START_TIMESTAMP = 0;
export const EPOCH_DURATION_MS = 6 * 30 * 24 * 60 * 60 * 1000;
export const INITIAL_SMELT_PER_ACCOUNT = 1_000;

export function currentSmeltPerAccount(): number {
  if (PROGRAM_START_TIMESTAMP === 0) return INITIAL_SMELT_PER_ACCOUNT;
  const epoch = Math.floor((Date.now() - PROGRAM_START_TIMESTAMP) / EPOCH_DURATION_MS);
  return Math.floor(INITIAL_SMELT_PER_ACCOUNT / Math.pow(2, epoch));
}
```

- [ ] **Step 5: Run token creation script**

```bash
npx ts-node scripts/create-smelt-token.ts
# Expected output:
# Admin: <your-admin-pubkey>
# ✓ SMELT mint: <mint-address>
# ✓ Minted 1,000,000,000 SMELT
# → Update lib/constants.ts: SMELT_MINT = <mint-address>
```

- [ ] **Step 6: Update lib/constants.ts with real SMELT_MINT address from step 5 output**

- [ ] **Step 7: Commit**

```bash
git add scripts/create-smelt-token.ts lib/constants.ts
git commit -m "feat: SMELT token creation script + constants"
```

---

## Task 3: Anchor program — state + errors

**Files:**
- Create: `programs/smelt_staking/src/lib.rs`
- Create: `programs/smelt_staking/src/state.rs`
- Create: `programs/smelt_staking/src/errors.rs`
- Create: `programs/smelt_staking/src/instructions/mod.rs`

- [ ] **Step 1: Write programs/smelt_staking/src/errors.rs**

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
}
```

- [ ] **Step 2: Write programs/smelt_staking/src/state.rs**

```rust
use anchor_lang::prelude::*;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub smelt_mint: Pubkey,
    pub vault: Pubkey,
    pub total_staked: u64,
    pub bump: u8,
}

impl GlobalState {
    // 8 discriminator + 32 admin + 32 smelt_mint + 32 vault + 8 total_staked + 1 bump
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount_staked: u64,
    pub bump: u8,
}

impl StakeAccount {
    // 8 discriminator + 32 owner + 8 amount_staked + 1 bump
    pub const LEN: usize = 8 + 32 + 8 + 1;
}
```

- [ ] **Step 3: Write programs/smelt_staking/src/instructions/mod.rs**

```rust
pub mod initialize;
pub mod stake;
pub mod unstake;
```

- [ ] **Step 4: Write programs/smelt_staking/src/lib.rs (placeholder program ID)**

```rust
use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::initialize::Initialize;
use instructions::stake::Stake;
use instructions::unstake::Unstake;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod smelt_staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, amount)
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        instructions::unstake::handler(ctx, amount)
    }
}
```

- [ ] **Step 5: Verify it compiles (no instructions implemented yet)**

```bash
cargo build-sbf 2>&1 | head -30
# Expected: errors about missing modules (initialize.rs, stake.rs, unstake.rs) — that's fine for now
# Or create empty placeholder files first:
touch programs/smelt_staking/src/instructions/initialize.rs
touch programs/smelt_staking/src/instructions/stake.rs
touch programs/smelt_staking/src/instructions/unstake.rs
```

- [ ] **Step 6: Commit**

```bash
git add programs/smelt_staking/src/
git commit -m "feat: Anchor program state structs and error codes"
```

---

## Task 4: `initialize` instruction

**Files:**
- Create: `programs/smelt_staking/src/instructions/initialize.rs`

- [ ] **Step 1: Write the failing test for initialize**

Create `tests/smelt_staking.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SmeltStaking } from "../target/types/smelt_staking";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createMint, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("smelt_staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SmeltStaking as Program<SmeltStaking>;
  const admin = provider.wallet as anchor.Wallet;

  let smeltMint: PublicKey;
  let globalStatePda: PublicKey;
  let vaultAta: PublicKey;

  before(async () => {
    smeltMint = await createMint(provider.connection, admin.payer, admin.publicKey, null, 9);
    [globalStatePda] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
    vaultAta = getAssociatedTokenAddressSync(smeltMint, globalStatePda, true);
  });

  it("initialize: creates GlobalState with correct fields and empty vault ATA", async () => {
    await program.methods
      .initialize()
      .accounts({ admin: admin.publicKey, smeltMint, globalState: globalStatePda, vault: vaultAta })
      .rpc();

    const gs = await program.account.globalState.fetch(globalStatePda);
    assert.equal(gs.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(gs.smeltMint.toBase58(), smeltMint.toBase58());
    assert.equal(gs.vault.toBase58(), vaultAta.toBase58());
    assert.equal(gs.totalStaked.toNumber(), 0);

    const vault = await getAccount(provider.connection, vaultAta);
    assert.equal(vault.amount, 0n);
  });
});
```

- [ ] **Step 2: Build and run test to verify it fails**

```bash
anchor build
anchor test --skip-deploy
# Expected: FAIL — initialize instruction not implemented
```

- [ ] **Step 3: Write programs/smelt_staking/src/instructions/initialize.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use crate::state::GlobalState;

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let global = &mut ctx.accounts.global_state;
    global.admin = ctx.accounts.admin.key();
    global.smelt_mint = ctx.accounts.smelt_mint.key();
    global.vault = ctx.accounts.vault.key();
    global.total_staked = 0;
    global.bump = ctx.bumps.global_state;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub smelt_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = GlobalState::LEN,
        seeds = [b"global"],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = smelt_mint,
        associated_token::authority = global_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}
```

- [ ] **Step 4: Build and run test to verify it passes**

```bash
anchor build
anchor test --skip-deploy
# Expected: PASS — initialize creates GlobalState and vault ATA
```

- [ ] **Step 5: Commit**

```bash
git add programs/smelt_staking/src/instructions/initialize.rs tests/smelt_staking.ts
git commit -m "feat: Anchor initialize instruction + test"
```

---

## Task 5: `stake` instruction

**Files:**
- Modify: `programs/smelt_staking/src/instructions/stake.rs`
- Modify: `tests/smelt_staking.ts`

- [ ] **Step 1: Add stake tests to tests/smelt_staking.ts (after the initialize block)**

Add to `tests/smelt_staking.ts` — new variables at top of describe block:

```typescript
  let user: Keypair;
  let userSmeltAta: PublicKey;
  let stakeAccountPda: PublicKey;
```

Add to `before()` block:

```typescript
    const { getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    user = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(user.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig);
    const ata = await getOrCreateAssociatedTokenAccount(provider.connection, admin.payer, smeltMint, user.publicKey);
    userSmeltAta = ata.address;
    await mintTo(provider.connection, admin.payer, smeltMint, userSmeltAta, admin.publicKey, 1_000n * 10n ** 9n);
    [stakeAccountPda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), user.publicKey.toBuffer()], program.programId);
```

Add new test cases:

```typescript
  it("stake: transfers SMELT to vault and updates StakeAccount + GlobalState", async () => {
    const amount = new anchor.BN("500000000000"); // 500 SMELT
    await program.methods.stake(amount)
      .accounts({ owner: user.publicKey, stakeAccount: stakeAccountPda, globalState: globalStatePda, userSmelt: userSmeltAta, vault: vaultAta })
      .signers([user]).rpc();

    const sa = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(sa.amountStaked.toString(), amount.toString());
    assert.equal(sa.owner.toBase58(), user.publicKey.toBase58());

    const gs = await program.account.globalState.fetch(globalStatePda);
    assert.equal(gs.totalStaked.toString(), amount.toString());

    const vault = await getAccount(provider.connection, vaultAta);
    assert.equal(vault.amount.toString(), amount.toString());
  });

  it("stake: rejects zero amount", async () => {
    try {
      await program.methods.stake(new anchor.BN(0))
        .accounts({ owner: user.publicKey, stakeAccount: stakeAccountPda, globalState: globalStatePda, userSmelt: userSmeltAta, vault: vaultAta })
        .signers([user]).rpc();
      assert.fail("expected error");
    } catch (e: any) {
      assert.include(e.message, "ZeroAmount");
    }
  });
```

- [ ] **Step 2: Run tests to verify stake tests fail**

```bash
anchor test --skip-deploy
# Expected: FAIL — stake not implemented
```

- [ ] **Step 3: Write programs/smelt_staking/src/instructions/stake.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::StakingError;
use crate::state::{GlobalState, StakeAccount};

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_smelt.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let stake = &mut ctx.accounts.stake_account;
    stake.owner = ctx.accounts.owner.key();
    stake.amount_staked = stake.amount_staked.checked_add(amount).unwrap();
    stake.bump = ctx.bumps.stake_account;

    ctx.accounts.global_state.total_staked = ctx.accounts.global_state
        .total_staked.checked_add(amount).unwrap();

    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = StakeAccount::LEN,
        seeds = [b"stake", owner.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut, seeds = [b"global"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        token::mint = global_state.smelt_mint,
        token::authority = owner,
    )]
    pub user_smelt: Account<'info, TokenAccount>,

    #[account(mut, address = global_state.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 4: Build and run tests**

```bash
anchor build && anchor test --skip-deploy
# Expected: initialize PASS, stake PASS, stake-zero PASS
```

- [ ] **Step 5: Commit**

```bash
git add programs/smelt_staking/src/instructions/stake.rs tests/smelt_staking.ts
git commit -m "feat: Anchor stake instruction + tests"
```

---

## Task 6: `unstake` instruction

**Files:**
- Modify: `programs/smelt_staking/src/instructions/unstake.rs`
- Modify: `tests/smelt_staking.ts`

- [ ] **Step 1: Add unstake tests to tests/smelt_staking.ts**

```typescript
  it("unstake: returns SMELT to user and decrements counters", async () => {
    const unstakeAmount = new anchor.BN("200000000000"); // 200 SMELT
    const { getAccount: getAcc } = await import("@solana/spl-token");

    const userBalanceBefore = (await getAcc(provider.connection, userSmeltAta)).amount;

    await program.methods.unstake(unstakeAmount)
      .accounts({ owner: user.publicKey, stakeAccount: stakeAccountPda, globalState: globalStatePda, userSmelt: userSmeltAta, vault: vaultAta })
      .signers([user]).rpc();

    const sa = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(sa.amountStaked.toString(), "300000000000"); // 500 - 200

    const gs = await program.account.globalState.fetch(globalStatePda);
    assert.equal(gs.totalStaked.toString(), "300000000000");

    const userBalanceAfter = (await getAcc(provider.connection, userSmeltAta)).amount;
    assert.equal((userBalanceAfter - userBalanceBefore).toString(), "200000000000");
  });

  it("unstake: rejects amount exceeding staked balance", async () => {
    try {
      await program.methods.unstake(new anchor.BN("999000000000")) // 999 SMELT, only 300 staked
        .accounts({ owner: user.publicKey, stakeAccount: stakeAccountPda, globalState: globalStatePda, userSmelt: userSmeltAta, vault: vaultAta })
        .signers([user]).rpc();
      assert.fail("expected error");
    } catch (e: any) {
      assert.include(e.message, "InsufficientStake");
    }
  });

  it("unstake: rejects zero amount", async () => {
    try {
      await program.methods.unstake(new anchor.BN(0))
        .accounts({ owner: user.publicKey, stakeAccount: stakeAccountPda, globalState: globalStatePda, userSmelt: userSmeltAta, vault: vaultAta })
        .signers([user]).rpc();
      assert.fail("expected error");
    } catch (e: any) {
      assert.include(e.message, "ZeroAmount");
    }
  });
```

- [ ] **Step 2: Run tests to verify unstake tests fail**

```bash
anchor test --skip-deploy
# Expected: FAIL on unstake tests
```

- [ ] **Step 3: Write programs/smelt_staking/src/instructions/unstake.rs**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::StakingError;
use crate::state::{GlobalState, StakeAccount};

pub fn handler(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);
    require!(ctx.accounts.stake_account.amount_staked >= amount, StakingError::InsufficientStake);

    let bump = ctx.accounts.global_state.bump;
    let seeds = &[b"global".as_ref(), &[bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_smelt.to_account_info(),
                authority: ctx.accounts.global_state.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    ctx.accounts.stake_account.amount_staked = ctx.accounts.stake_account
        .amount_staked.checked_sub(amount).unwrap();
    ctx.accounts.global_state.total_staked = ctx.accounts.global_state
        .total_staked.checked_sub(amount).unwrap();

    Ok(())
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == owner.key(),
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut, seeds = [b"global"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        token::mint = global_state.smelt_mint,
        token::authority = owner,
    )]
    pub user_smelt: Account<'info, TokenAccount>,

    #[account(mut, address = global_state.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 4: Build and run all tests**

```bash
anchor build && anchor test --skip-deploy
# Expected: all 6 tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add programs/smelt_staking/src/instructions/unstake.rs tests/smelt_staking.ts
git commit -m "feat: Anchor unstake instruction + tests — all 6 passing"
```

---

## Task 7: Deploy to devnet + update constants

**Files:**
- Modify: `Anchor.toml`
- Modify: `programs/smelt_staking/src/lib.rs`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Generate a stable program keypair**

```bash
solana-keygen new --no-bip39-passphrase -o target/deploy/smelt_staking-keypair.json
solana address -k target/deploy/smelt_staking-keypair.json
# Save this — it's your PROGRAM_ID
```

- [ ] **Step 2: Update declare_id in lib.rs with real program ID**

Replace `11111111111111111111111111111111` in `programs/smelt_staking/src/lib.rs` with the address from step 1.

- [ ] **Step 3: Update Anchor.toml with real program ID**

Replace both `11111111111111111111111111111111` values in `Anchor.toml` with the same address.

- [ ] **Step 4: Build the program**

```bash
anchor build
# Expected: target/deploy/smelt_staking.so created
```

- [ ] **Step 5: Deploy to devnet**

```bash
anchor deploy --provider.cluster devnet --provider.wallet data/keypairs/admin.json
# Expected: Program Id: <program-id>
# If insufficient SOL: solana airdrop 4 $(solana address -k data/keypairs/admin.json) --url devnet
```

- [ ] **Step 6: Run initialize to create GlobalState on devnet**

```bash
npx ts-node scripts/initialize-program.ts
```

Create `scripts/initialize-program.ts`:

```typescript
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import * as fs from 'fs';
import { SMELT_MINT, STAKING_PROGRAM_ID } from '../lib/constants';
import idl from '../target/idl/smelt_staking.json';

async function main() {
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('data/keypairs/admin.json', 'utf-8')))
  );
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, provider);

  const [globalStatePda] = PublicKey.findProgramAddressSync([Buffer.from('global')], STAKING_PROGRAM_ID);
  const vaultAta = getAssociatedTokenAddressSync(SMELT_MINT, globalStatePda, true);

  await (program.methods as any).initialize()
    .accounts({ admin: adminKeypair.publicKey, smeltMint: SMELT_MINT, globalState: globalStatePda, vault: vaultAta })
    .rpc();

  console.log('✓ GlobalState initialized:', globalStatePda.toBase58());
  console.log('✓ Vault ATA:', vaultAta.toBase58());
}

main().catch(console.error);
```

- [ ] **Step 7: Update lib/constants.ts with all deployed addresses**

```typescript
export const SMELT_MINT = new PublicKey('<real-mint-from-task-2>');
export const STAKING_PROGRAM_ID = new PublicKey('<real-program-id-from-this-task>');
export const VAULT_PUBKEY = new PublicKey('<real-vault-pubkey-from-data/keypairs/vault.json>');
export const PROGRAM_START_TIMESTAMP = Date.now(); // set at launch
```

- [ ] **Step 8: Commit**

```bash
git add programs/ Anchor.toml lib/constants.ts scripts/initialize-program.ts
git commit -m "feat: deploy smelt_staking to devnet — program live"
```
