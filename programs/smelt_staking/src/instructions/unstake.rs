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
