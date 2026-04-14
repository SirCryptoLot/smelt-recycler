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
