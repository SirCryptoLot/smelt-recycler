// app/card/[wallet]/page.tsx
import { Metadata } from 'next';
import Link from 'next/link';
import { getWalletStats, getWeeklyRank } from '@/lib/leaderboard';
import ShareButtons from './ShareButtons';

interface Props {
  params: { wallet: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = params;
  let accounts = 0;
  let solReclaimed = 0;
  let smeltEarned = 0;
  try {
    const stats = getWalletStats(wallet);
    accounts     = stats.allTime.accounts;
    solReclaimed = stats.allTime.solReclaimed;
    smeltEarned  = stats.allTime.smeltEarned;
  } catch { /* use defaults */ }

  return {
    title: `${wallet.slice(0, 6)}…${wallet.slice(-4)} recycled ${accounts} accounts — SMELT Recycler`,
    description: `${accounts} accounts recycled · ${solReclaimed.toFixed(4)} SOL reclaimed · ${smeltEarned.toLocaleString()} SMELT earned`,
    openGraph: {
      title: 'SMELT Recycler — Wallet Stats',
      description: `${accounts} accounts recycled on SMELT Recycler`,
      images: [
        {
          url: `/api/share-card?wallet=${wallet}`,
          width: 1200,
          height: 630,
          alt: 'SMELT Recycler stats card',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SMELT Recycler — Wallet Stats',
      images: [`/api/share-card?wallet=${wallet}`],
    },
  };
}

export default function CardPage({ params }: Props) {
  const { wallet } = params;
  let accounts     = 0;
  let solReclaimed = 0;
  let smeltEarned  = 0;
  let rank         = 0;
  try {
    const stats  = getWalletStats(wallet);
    accounts     = stats.allTime.accounts;
    solReclaimed = stats.allTime.solReclaimed;
    smeltEarned  = stats.allTime.smeltEarned;
    rank         = getWeeklyRank(wallet);
  } catch { /* render with defaults */ }

  const cardUrl = `/api/share-card?wallet=${wallet}`;
  const pageUrl = `/card/${wallet}`;

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-6">

      {/* Heading */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Recycling Stats</h1>
        <p className="text-gray-400 text-sm mt-1 font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</p>
      </div>

      {/* Card preview */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardUrl}
          alt="Recycling stats card"
          className="w-full"
          style={{ aspectRatio: '1200/630', display: 'block' }}
        />
      </div>

      {/* Share buttons (client component) */}
      <ShareButtons
        wallet={wallet}
        pageUrl={pageUrl}
        accounts={accounts}
        solReclaimed={solReclaimed}
        smeltEarned={smeltEarned}
        rank={rank}
      />

      {/* CTA */}
      <Link
        href="/"
        className="flex items-center justify-between rounded-2xl bg-green-50 border border-green-100 px-5 py-4 group hover:border-green-200 transition-colors"
      >
        <div>
          <div className="font-semibold text-sm text-green-800">Recycle your wallet</div>
          <div className="text-xs text-green-600 mt-0.5">Close dust accounts, get SOL back, earn SMELT</div>
        </div>
        <span className="text-green-600 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
      </Link>

    </div>
  );
}
