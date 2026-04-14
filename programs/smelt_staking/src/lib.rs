use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("CiMhekpwAzLAfRr8um6Hexpnf8L8iTXkGZxJKin9e9Mk");

// ── State ────────────────────────────────────────────────────────────

#[account]
pub struct GlobalState {
    pub admin: Pubkey,      // 32
    pub smelt_mint: Pubkey, // 32
    pub vault: Pubkey,      // 32
    pub total_staked: u64,  // 8
    pub bump: u8,           // 1
}

impl GlobalState {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 1 + 8; // discriminator + fields + padding
}

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,      // 32
    pub amount_staked: u64, // 8
    pub bump: u8,           // 1
}

impl StakeAccount {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8; // discriminator + fields + padding
}

// ── Errors ───────────────────────────────────────────────────────────

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient staked amount")]
    InsufficientStake,
}

// ── Program ──────────────────────────────────────────────────────────

#[program]
pub mod smelt_staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global = &mut ctx.accounts.global_state;
        global.admin = ctx.accounts.admin.key();
        global.smelt_mint = ctx.accounts.smelt_mint.key();
        global.vault = ctx.accounts.vault.key();
        global.total_staked = 0;
        global.bump = ctx.bumps.global_state;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
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

        let stake_acc = &mut ctx.accounts.stake_account;
        stake_acc.owner = ctx.accounts.owner.key();
        stake_acc.amount_staked = stake_acc.amount_staked.checked_add(amount).unwrap();
        stake_acc.bump = ctx.bumps.stake_account;

        ctx.accounts.global_state.total_staked = ctx
            .accounts
            .global_state
            .total_staked
            .checked_add(amount)
            .unwrap();

        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        require!(
            ctx.accounts.stake_account.amount_staked >= amount,
            StakingError::InsufficientStake
        );

        let bump = ctx.accounts.global_state.bump;
        let seeds: &[&[u8]] = &[b"global", &[bump]];

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

        ctx.accounts.stake_account.amount_staked = ctx
            .accounts
            .stake_account
            .amount_staked
            .checked_sub(amount)
            .unwrap();

        ctx.accounts.global_state.total_staked = ctx
            .accounts
            .global_state
            .total_staked
            .checked_sub(amount)
            .unwrap();

        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────────────────

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
