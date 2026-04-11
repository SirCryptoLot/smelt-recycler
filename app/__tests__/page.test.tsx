import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getTrashAccounts, solToReclaim } from '@/lib/solana';
import Home from '../page';
import { PublicKey } from '@solana/web3.js';

jest.mock('@solana/wallet-adapter-react');
jest.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: () => <button>Connect Wallet</button>,
}));
jest.mock('@/lib/solana', () => ({
  getTrashAccounts: jest.fn(),
  solToReclaim: jest.requireActual('@/lib/solana').solToReclaim,
  connection: {},
}));
jest.mock('@/lib/recycle', () => ({
  recycleAccounts: jest.fn(),
}));

import { recycleAccounts } from '@/lib/recycle';
const mockRecycleAccounts = recycleAccounts as jest.Mock;

const mockUseWallet = useWallet as jest.Mock;
const mockGetTrashAccounts = getTrashAccounts as jest.Mock;
export const TEST_PUBKEY = new PublicKey('FhG6X1kh1TM4H5fs7rAecXDs8VF8iTUoafGGMjhZf8Mo');

beforeEach(() => {
  jest.clearAllMocks();
  mockRecycleAccounts.mockReset();
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
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
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
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });
    mockGetTrashAccounts.mockImplementation(() => new Promise(() => {}));
    render(<Home />);
    expect(screen.getByText('Scanning accounts…')).toBeInTheDocument();
  });

  it('shows trash account cards and SOL stat after scan completes', async () => {
    const trashAccounts = [
      {
        pubkey: TEST_PUBKEY,
        mint: new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263'),
        balance: 142000,
        usdValue: 0.03,
        pricePerToken: 0.0000002,
      },
    ];
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });
    mockGetTrashAccounts.mockResolvedValue(trashAccounts);
    render(<Home />);
    await screen.findByText('TRASH ACCOUNTS');
    expect(screen.getByText('$0.03')).toBeInTheDocument();
    expect(screen.getByText('SOL TO RECLAIM')).toBeInTheDocument();
  });

  it('shows Recycle All button with SOL amount in results state', async () => {
    const trashAccounts = [
      {
        pubkey: TEST_PUBKEY,
        mint: new PublicKey('DezXAZ8z7PnrnRJjz3wXboRgixCa6xjnB7YaB1pPB263'),
        balance: 142000,
        usdValue: 0.03,
        pricePerToken: 0.0000002,
      },
    ];
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });
    mockGetTrashAccounts.mockResolvedValue(trashAccounts);
    render(<Home />);
    await screen.findByText('TRASH ACCOUNTS');
    expect(screen.getByRole('button', { name: /RECYCLE ALL/i })).toBeInTheDocument();
  });

  it('shows empty state when no trash accounts found', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });
    mockGetTrashAccounts.mockResolvedValue([]);
    render(<Home />);
    await screen.findByText('Nothing to recycle');
    expect(screen.getByText('Your wallet is clean.')).toBeInTheDocument();
  });

  it('shows error banner with message and Try again button when scan fails', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });
    mockGetTrashAccounts.mockRejectedValue(new Error('Jupiter API error: 429'));
    render(<Home />);
    await screen.findByText('Scan failed');
    expect(screen.getByText('Jupiter API error: 429')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows recycling spinner when RECYCLE ALL is clicked', async () => {
    mockRecycleAccounts.mockImplementation(() => new Promise(() => {})); // never resolves

    mockGetTrashAccounts.mockResolvedValue([
      {
        pubkey: { toBase58: () => 'pubkey1' },
        mint: { toBase58: () => 'mint1111' },
        balance: 100,
        usdValue: 0.01,
        pricePerToken: 0.0001,
        rawAmount: BigInt(100),
        decimals: 6,
      },
    ]);

    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });

    render(<Home />);
    await waitFor(() => screen.getByText('TRASH ACCOUNTS'));
    fireEvent.click(screen.getByText(/RECYCLE ALL/));
    await waitFor(() => screen.getByText(/Recycling/));
    expect(screen.getByText(/Recycling 1 accounts/)).toBeInTheDocument();
  });

  it('shows success state with reclaimed SOL after recycling', async () => {
    mockRecycleAccounts.mockResolvedValue({ succeeded: 1, failed: 0, solReclaimed: 0.0019 });

    mockGetTrashAccounts.mockResolvedValue([
      {
        pubkey: { toBase58: () => 'pubkey1' },
        mint: { toBase58: () => 'mint1111' },
        balance: 100,
        usdValue: 0.01,
        pricePerToken: 0.0001,
        rawAmount: BigInt(100),
        decimals: 6,
      },
    ]);

    mockUseWallet.mockReturnValue({
      publicKey: TEST_PUBKEY,
      connected: true,
      disconnect: jest.fn(),
      signAllTransactions: jest.fn(async (txs: any[]) => txs),
    });

    render(<Home />);
    await waitFor(() => screen.getByText('TRASH ACCOUNTS'));
    fireEvent.click(screen.getByText(/RECYCLE ALL/));
    await waitFor(() => screen.getByText(/Reclaimed/));
    expect(screen.getByText(/Reclaimed ~0.002 SOL/)).toBeInTheDocument();
    expect(screen.getByText('Scan Again')).toBeInTheDocument();
  });
});
