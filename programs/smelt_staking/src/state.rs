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
