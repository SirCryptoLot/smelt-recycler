// lib/__tests__/solana.test.ts
import { PublicKey } from '@solana/web3.js';
import * as solanaModule from '../solana';

const WALLET    = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
const MINT_BONK = 'DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ACCT_BONK = new PublicKey('11111111111111111111111111111112');
const ACCT_USDC = new PublicKey('11111111111111111111111111111113');

function makeAccount(pubkey: PublicKey, mint: string, uiAmount: number) {
  return {
    pubkey,
    account: { data: { parsed: { info: { mint, tokenAmount: { uiAmount } } } } },
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

  it('is exported and returns a Promise', () => {
    const result = solanaModule.getTrashAccounts(WALLET);
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('returns empty array when wallet has no token accounts', async () => {
    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
    expect(mockGetParsed).toHaveBeenCalledWith(
      WALLET,
      { programId: expect.any(Object) }
    );
  });

  it('filters out zero-balance accounts without calling Jupiter', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 0)],
    } as any);

    const result = await solanaModule.getTrashAccounts(WALLET);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
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

  it('throws when Jupiter returns a non-ok response', async () => {
    mockGetParsed.mockResolvedValue({
      value: [makeAccount(ACCT_BONK, MINT_BONK, 100)],
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

    await expect(solanaModule.getTrashAccounts(WALLET)).rejects.toThrow(
      'Jupiter API error: 429'
    );
  });
});
