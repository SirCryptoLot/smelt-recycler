/**
 * @jest-environment jsdom
 */
// lib/__tests__/smelt-context.test.ts
import { renderHook, act } from '@testing-library/react';
import { SmeltProvider, useSmelt } from '../smelt-context';
import { fetchSmeltBalance } from '../smelt';
import { PublicKey } from '@solana/web3.js';

jest.mock('../smelt', () => ({ fetchSmeltBalance: jest.fn() }));
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(() => ({ publicKey: null })),
  useConnection: jest.fn(() => ({ connection: {} })),
}));

import { useWallet } from '@solana/wallet-adapter-react';
const mockFetch = fetchSmeltBalance as jest.Mock;
const mockUseWallet = useWallet as jest.Mock;

it('returns 0n when no wallet connected', () => {
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  expect(result.current.smeltBalance).toBe(0n);
});

it('fetches balance when wallet connects', async () => {
  const pk = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
  mockFetch.mockResolvedValue(500_000_000_000n);
  mockUseWallet.mockReturnValue({ publicKey: pk });
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  await act(async () => {});
  expect(result.current.smeltBalance).toBe(500_000_000_000n);
});

it('refreshSmelt re-fetches balance', async () => {
  const pk = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');
  mockFetch.mockResolvedValue(0n);
  mockUseWallet.mockReturnValue({ publicKey: pk });
  const { result } = renderHook(() => useSmelt(), { wrapper: SmeltProvider });
  await act(async () => {});
  mockFetch.mockResolvedValue(1_000_000_000n);
  await act(async () => { result.current.refreshSmelt(); });
  expect(result.current.smeltBalance).toBe(1_000_000_000n);
});
