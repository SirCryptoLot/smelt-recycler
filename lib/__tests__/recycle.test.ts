// lib/__tests__/recycle.test.ts
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TrashAccount } from '../solana';

const TOKEN_PROGRAM_ID   = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROG   = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1d');

// Mock @solana/spl-token instruction builders — they return minimal objects
jest.mock('@solana/spl-token', () => ({
  createAssociatedTokenAccountIdempotentInstruction: jest.fn(() => ({ type: 'createATA' })),
  createTransferCheckedInstruction: jest.fn(() => ({ type: 'transfer' })),
  createCloseAccountInstruction: jest.fn(() => ({ type: 'close' })),
  getAssociatedTokenAddress: jest.fn(async () =>
    new PublicKey('11111111111111111111111111111112')
  ),
  TOKEN_PROGRAM_ID:   new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  ASSOCIATED_TOKEN_PROGRAM_ID: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1d'),
}));

// Mock Transaction so serialize() doesn't fail on unsigned test transactions
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  class MockTransaction {
    instructions: any[] = [];
    recentBlockhash?: string;
    feePayer?: any;
    add(...ixs: any[]) { this.instructions.push(...ixs); return this; }
    serialize() { return Buffer.from('fake-tx'); }
  }
  return { ...actual, Transaction: MockTransaction };
});

// Mock connection from lib/solana
const mockConnection = {
  getLatestBlockhash: jest.fn(),
  getAccountInfo: jest.fn(),
  sendRawTransaction: jest.fn(),
  confirmTransaction: jest.fn(),
};
jest.mock('../solana', () => ({
  connection: mockConnection,
  MAINNET_RPC: 'http://localhost',
}));

// Mock fetch used by preSimulate — always return "no error" (simulation passes)
global.fetch = jest.fn(async () => ({
  ok: true,
  json: async () => ({ result: { value: { err: null, logs: [] } } }),
})) as jest.Mock;

import { recycleAccounts } from '../recycle';

const OWNER  = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_A = new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263');

function makeDustAccount(i: number): TrashAccount {
  const bytes = new Uint8Array(32);
  bytes[0] = i + 1;
  return {
    pubkey: new PublicKey(bytes),
    mint: MINT_A,
    balance: 100,
    usdValue: 0.01,
    pricePerToken: 0.0001,
    rawAmount: BigInt(100_000_000),
    decimals: 6,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

function makeEmptyAccount(i: number): TrashAccount {
  const bytes = new Uint8Array(32);
  bytes[0] = i + 100;
  return {
    pubkey: new PublicKey(bytes),
    mint: MINT_A,
    balance: 0,
    usdValue: 0,
    pricePerToken: 0,
    rawAmount: 0n,
    decimals: 6,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

describe('recycleAccounts', () => {
  let signAllTransactions: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ result: { value: { err: null, logs: [] } } }),
    });
    mockConnection.getLatestBlockhash.mockResolvedValue({
      blockhash: 'testblockhash',
      lastValidBlockHeight: 1000,
    });
    mockConnection.getAccountInfo.mockResolvedValue({}); // SMELT ATA exists
    mockConnection.sendRawTransaction.mockResolvedValue('sig-ok');
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
    signAllTransactions = jest.fn(async (txs: any[]) => txs);
  });

  it('happy path: 4 dust accounts → succeeds, returns correct solReclaimed', async () => {
    const accounts = Array.from({ length: 4 }, (_, i) => makeDustAccount(i));
    const result = await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(signAllTransactions).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.solReclaimed).toBeCloseTo(4 * 0.002 * 0.95, 6);
  });

  it('dust batch size=2: 4 dust accounts → 2 transactions', async () => {
    const accounts = Array.from({ length: 4 }, (_, i) => makeDustAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    const [calledTxs] = signAllTransactions.mock.calls[0] as [any[]];
    expect(calledTxs).toHaveLength(2);
  });

  it('empty batch size=7: 7 empty accounts → 1 transaction', async () => {
    const accounts = Array.from({ length: 7 }, (_, i) => makeEmptyAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    const [calledTxs] = signAllTransactions.mock.calls[0] as [any[]];
    expect(calledTxs).toHaveLength(1);
  });

  it('partial failure: batch 2 fails all retries → correct succeeded/failed split', async () => {
    jest.useFakeTimers();
    // 4 dust accounts → 2 batches of 2
    const accounts = Array.from({ length: 4 }, (_, i) => makeDustAccount(i));

    mockConnection.sendRawTransaction
      .mockResolvedValueOnce('sig-ok')   // batch 1 succeeds
      .mockRejectedValue(new Error('network error')); // batch 2 fails (× 3 retries)

    const resultPromise = recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.solReclaimed).toBeCloseTo(2 * 0.002 * 0.95, 6);

    jest.useRealTimers();
  });

  it('user rejection: signAllTransactions throws → recycleAccounts re-throws', async () => {
    const accounts = [makeDustAccount(0)];
    signAllTransactions.mockRejectedValue(new Error('User rejected'));

    await expect(
      recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any)
    ).rejects.toThrow('User rejected');
  });

  it('empty account (rawAmount=0n): only closeAccount instruction, no transfer or ATA', async () => {
    const { createCloseAccountInstruction, createTransferCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction } =
      jest.requireMock('@solana/spl-token');

    await recycleAccounts([makeEmptyAccount(0)], OWNER, signAllTransactions, mockConnection as any);

    expect(createCloseAccountInstruction).toHaveBeenCalledTimes(1);
    expect(createTransferCheckedInstruction).not.toHaveBeenCalled();
    expect(createAssociatedTokenAccountIdempotentInstruction).not.toHaveBeenCalled();
  });

  it('fee instruction: lamports = ceil(batchSize * 0.002 * 0.05 * LAMPORTS_PER_SOL)', async () => {
    const { SystemProgram } = jest.requireActual('@solana/web3.js');
    const transferSpy = jest.spyOn(SystemProgram, 'transfer');

    // 2 dust accounts → 1 batch of 2
    const accounts = Array.from({ length: 2 }, (_, i) => makeDustAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(transferSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lamports: Math.ceil(2 * 0.002 * 0.05 * LAMPORTS_PER_SOL),
      })
    );
    transferSpy.mockRestore();
  });
});
