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

  let user: Keypair;
  let userSmeltAta: PublicKey;
  let stakeAccountPda: PublicKey;

  before(async () => {
    smeltMint = await createMint(provider.connection, admin.payer, admin.publicKey, null, 9);
    [globalStatePda] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
    vaultAta = getAssociatedTokenAddressSync(smeltMint, globalStatePda, true);
    const { getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    user = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(user.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig);
    const ata = await getOrCreateAssociatedTokenAccount(provider.connection, admin.payer, smeltMint, user.publicKey);
    userSmeltAta = ata.address;
    await mintTo(provider.connection, admin.payer, smeltMint, userSmeltAta, admin.publicKey, 1_000_000_000_000); // 1000 SMELT (9 decimals)
    [stakeAccountPda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), user.publicKey.toBuffer()], program.programId);
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
});
