import { render, screen } from '@testing-library/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getTrashAccounts } from '@/lib/solana';
import Home, { solToReclaim } from '../page';
import { PublicKey } from '@solana/web3.js';

jest.mock('@solana/wallet-adapter-react');
jest.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
jest.mock('@/lib/solana', () => ({
  getTrashAccounts: jest.fn(),
}));

const mockUseWallet = useWallet as jest.Mock;
const mockGetTrashAccounts = getTrashAccounts as jest.Mock;
export const TEST_PUBKEY = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── solToReclaim ──────────────────────────────────────────────
describe('solToReclaim', () => {
  it('returns 0 for 0 accounts', () => {
    expect(solToReclaim(0)).toBe(0);
  });

  it('returns 0.002 * 0.95 per account', () => {
    expect(solToReclaim(1)).toBeCloseTo(0.0019);
    expect(solToReclaim(2)).toBeCloseTo(0.0038);
  });
});

// ── Home — disconnected ───────────────────────────────────────
describe('Home', () => {
  it('shows connect prompt and Connect button when disconnected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
      disconnect: jest.fn(),
    });
    render(<Home />);
    expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });

  it('shows scanning spinner immediately after wallet connects', () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
    });
    mockGetTrashAccounts.mockResolvedValue([]);
    render(<Home />);
    expect(screen.getByText('Scanning accounts…')).toBeInTheDocument();
  });
});
