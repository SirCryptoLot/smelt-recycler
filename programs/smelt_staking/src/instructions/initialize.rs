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
