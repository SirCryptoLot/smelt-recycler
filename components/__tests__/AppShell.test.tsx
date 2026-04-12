/**
 * @jest-environment jsdom
 */
// components/__tests__/AppShell.test.tsx
import { render, screen } from '@testing-library/react';
import { AppShell } from '../AppShell';

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(() => ({ publicKey: null, connected: false, disconnect: jest.fn() })),
  useConnection: jest.fn(() => ({ connection: {} })),
}));
jest.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));
jest.mock('@/lib/smelt-context', () => ({
  useSmelt: jest.fn(() => ({ smeltBalance: 0n, refreshSmelt: jest.fn() })),
}));

it('renders nav links', () => {
  render(<AppShell><div>content</div></AppShell>);
  expect(screen.getByText('Recycle')).toBeInTheDocument();
  expect(screen.getByText('Pools')).toBeInTheDocument();
  expect(screen.getByText('How it works')).toBeInTheDocument();
});

it('renders brand name', () => {
  render(<AppShell><div>content</div></AppShell>);
  expect(screen.getByText('Recycler')).toBeInTheDocument();
});

it('renders children', () => {
  render(<AppShell><div>my-content</div></AppShell>);
  expect(screen.getByText('my-content')).toBeInTheDocument();
});

it('renders connect button when wallet not connected', () => {
  render(<AppShell><div /></AppShell>);
  expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
});
