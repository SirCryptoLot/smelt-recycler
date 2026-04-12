// lib/__tests__/solana.test.ts
import { PublicKey } from '@solana/web3.js';
import * as solanaModule from '../solana';

const WALLET    = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_BONK = 'DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ACCT_BONK = new PublicKey('11111111111111111111111111111112');
const ACCT_USDC = new PublicKey('11111111111111111111111111111113');

function makeAccount(
  pubkey: PublicKey,
  mint: string,
  uiAmount: number,
  amount = '0',
  decimals = 6,
  state = 'initialized',
) {
  return {
    pubkey,
    account: { data: { parsed: { info: { mint, state, tokenAmount: { uiAmount, amount, decimals } } } } },
  };
}

describe('getTrashAccounts', () => {
  let mockGetParsed: jest.SpyInstance;

  beforeEach(() => {
    mockGetParsed = jest
      .spyOn(solanaModule.connection, 'getParsedTokenAccountsByOwner')
      .mockResolvedValue({ value: [] } as any);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns empty array when wallet has no token accounts', async () => {
    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
    expect(mockGetParsed).toHaveBeenCalledWith(
      WALLET,
      { programId: expect.any(Object) }
    );
  });

  it('includes zero-balance (empty) accounts without calling Jupiter for prices', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 0, '0', 6)],
    } as any);

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(0);
    expect(result[0].usdValue).toBe(0);
    expect(result[0].rawAmount).toBe(0n);
    expect(global.fetch).not.toHaveBeenCalled(); // no Jupiter call for empty accounts
  });

  it('excludes frozen accounts', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100, '100000', 6, 'frozen')],
    } as any);

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
  });

  it('calls Jupiter with the mint address and maps pricePerToken', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_BONK]: { price: 0.0000002 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(MINT_BONK)
    );
    expect(result[0].pricePerToken).toBe(0.0000002);
  });

  it('treats unlisted mints (no Jupiter entry) as pricePerToken 0', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }), // MINT_BONK absent
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result[0].pricePerToken).toBe(0);
    expect(result[0].usdValue).toBe(0);
  });

  it('splits 110 mints into 3 parallel Jupiter requests', async () => {
    const accounts = Array.from({ length: 110 }, (_, i) => {
      const bytes = new Uint8Array(32);
      bytes[0] = Math.floor(i / 256);
      bytes[1] = i % 256;
      return makeAccount(ACCT_BONK, new PublicKey(bytes).toBase58(), 1);
    });
    mockGetParsed.mockResolvedValue({ value: accounts } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });

    await solanaModule.getTrashAccounts(WALLET);
    expect(global.fetch).toHaveBeenCalledTimes(3); // ceil(110 / 50) = 3
  });

  it('treats Jupiter non-ok responses as unlisted (pricePerToken 0)', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100, '100000000', 6)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result[0].pricePerToken).toBe(0);
    expect(result[0].usdValue).toBe(0);
  });

  it('excludes accounts with usdValue === $0.10 (strict less-than boundary)', async () => {
    // 10 tokens at $0.01/token = exactly $0.10 — should be excluded
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_USDC, MINT_USDC, 10)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_USDC]: { price: 0.01 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
  });

  it('excludes accounts with usdValue >= $0.10', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_USDC, MINT_USDC, 12.4)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_USDC]: { price: 1.0 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
  });

  it('includes accounts with usdValue < $0.10 with correct fields', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 142000, '142000000000', 6)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { [MINT_BONK]: { price: 0.0000002 } } }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toEqual(ACCT_BONK);
    expect(result[0].mint.toBase58()).toBe(MINT_BONK);
    expect(result[0].balance).toBe(142000);
    expect(result[0].pricePerToken).toBe(0.0000002);
    expect(result[0].usdValue).toBeCloseTo(0.0284);
    expect(result[0].rawAmount).toBe(BigInt('142000000000'));
    expect(result[0].decimals).toBe(6);
  });

  it('returns only trash accounts from a mixed wallet', async () => {
    mockGetParsed.mockResolvedValue({
      value: [
        makeAccount(ACCT_BONK, MINT_BONK, 142000, '142000000000', 6), // $0.0284 → trash
        makeAccount(ACCT_USDC, MINT_USDC, 12.4, '12400000', 6),       // $12.40  → kept
      ],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          [MINT_BONK]: { price: 0.0000002 },
          [MINT_USDC]: { price: 1.0 },
        },
      }),
    });

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toHaveLength(1);
    expect(result[0].mint.toBase58()).toBe(MINT_BONK);
    expect(result[0].rawAmount).toBe(BigInt('142000000000'));
    expect(result[0].decimals).toBe(6);
  });
});
