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
});
