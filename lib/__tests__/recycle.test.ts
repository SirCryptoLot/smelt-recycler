// lib/__tests__/recycle.test.ts
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TrashAccount } from '../solana';

// Mock @solana/spl-token instruction builders — they return minimal objects
jest.mock('@solana/spl-token', () => ({
  createAssociatedTokenAccountIdempotentInstruction: jest.fn(() => ({ type: 'createATA' })),
  createTransferCheckedInstruction: jest.fn(() => ({ type: 'transfer' })),
  createCloseAccountInstruction: jest.fn(() => ({ type: 'close' })),
  getAssociatedTokenAddress: jest.fn(async () =>
    new PublicKey('11111111111111111111111111111112')
  ),
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
  sendRawTransaction: jest.fn(),
  confirmTransaction: jest.fn(),
};
jest.mock('../solana', () => ({
  connection: mockConnection,
}));

import { recycleAccounts } from '../recycle';

const OWNER = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_A = new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263');

function makeTrashAccount(i: number): TrashAccount {
  const bytes = new Uint8Array(32);
  bytes[0] = i + 1; // avoid all-zeros key
  return {
    pubkey: new PublicKey(bytes),
    mint: MINT_A,
    balance: 100,
    usdValue: 0.01,
    pricePerToken: 0.0001,
    rawAmount: BigInt(100_000_000),
    decimals: 6,
  };
}

describe('recycleAccounts', () => {
  let signAllTransactions: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.getLatestBlockhash.mockResolvedValue({
      blockhash: 'testblockhash',
      lastValidBlockHeight: 1000,
    });
    mockConnection.sendRawTransaction.mockResolvedValue('sig-ok');
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
    signAllTransactions = jest.fn(async (txs: any[]) => txs);
  });

  it('happy path: 5 accounts → signAllTransactions called once, returns correct solReclaimed', async () => {
    const accounts = Array.from({ length: 5 }, (_, i) => makeTrashAccount(i));
    const result = await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(signAllTransactions).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.solReclaimed).toBeCloseTo(5 * 0.002 * 0.95, 6);
  });

  it('builds one transaction per 5-account batch (10 accounts → 2 txs)', async () => {
    const accounts = Array.from({ length: 10 }, (_, i) => makeTrashAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    const [calledTxs] = signAllTransactions.mock.calls[0] as [any[]];
    expect(calledTxs).toHaveLength(2);
  });

  it('partial failure: batch 2 fails all retries → succeeded=5, failed=5', async () => {
    jest.useFakeTimers();
    const accounts = Array.from({ length: 10 }, (_, i) => makeTrashAccount(i));

    // Queue: first send call succeeds (batch 1), all subsequent calls fail (batch 2 × 3 retries)
    mockConnection.sendRawTransaction
      .mockResolvedValueOnce('sig-ok')
      .mockRejectedValue(new Error('network error'));

    const resultPromise = recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    // Advance timers to skip the 1500ms retry delays
    await jest.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(5);
    expect(result.solReclaimed).toBeCloseTo(5 * 0.002 * 0.95, 6);

    jest.useRealTimers();
  });

  it('user rejection: signAllTransactions throws → recycleAccounts re-throws', async () => {
    const accounts = [makeTrashAccount(0)];
    signAllTransactions.mockRejectedValue(new Error('User rejected'));

    await expect(
      recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any)
    ).rejects.toThrow('User rejected');
  });

  it('fee instruction: lamports = ceil(batchSize * 0.002 * 0.05 * LAMPORTS_PER_SOL)', async () => {
    const { SystemProgram } = jest.requireActual('@solana/web3.js');
    const transferSpy = jest.spyOn(SystemProgram, 'transfer');

    const accounts = Array.from({ length: 5 }, (_, i) => makeTrashAccount(i));
    await recycleAccounts(accounts, OWNER, signAllTransactions, mockConnection as any);

    expect(transferSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lamports: Math.ceil(5 * 0.002 * 0.05 * LAMPORTS_PER_SOL),
      })
    );
    transferSpy.mockRestore();
  });
});
