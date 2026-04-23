// app/card/[wallet]/ShareButtons.tsx
'use client';

import { useState } from 'react';

interface Props {
  wallet: string;
  pageUrl: string;
  accounts: number;
  solReclaimed: number;
  smeltEarned: number;
  rank: number;
}

export default function ShareButtons({ wallet: _wallet, pageUrl, accounts, solReclaimed, smeltEarned, rank }: Props) {
  const [copied, setCopied] = useState(false);

  // Build full URL for sharing — falls back to relative if window not available
  const fullUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${pageUrl}`
    : pageUrl;

  function handleCopy() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const rankText = rank > 0 ? ` · Rank #${rank} this week` : '';
  const tweetText = encodeURIComponent(
    `Just cleaned my Solana wallet ♻\n\n${accounts} accounts recycled · ${solReclaimed.toFixed(4)} SOL reclaimed · ${smeltEarned.toLocaleString()} SMELT earned${rankText}\n\n`
  );
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(fullUrl)}`;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Copy link */}
      <button
        onClick={handleCopy}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700">Copied!</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy link
          </>
        )}
      </button>

      {/* Share on X */}
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-black hover:bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>
    </div>
  );
}
