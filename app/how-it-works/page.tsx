// app/how-it-works/page.tsx
'use client';

import { useState } from 'react';

function AddressRow({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-0.5">{label}</div>
        <div className="text-sm font-mono text-gray-700">{address.slice(0, 6)}…{address.slice(-4)}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={copy}
          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
        >
          Solscan ↗
        </a>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">How it works</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Recycler helps you clean up your Solana wallet, reclaim locked SOL, and earn SMELT —
            a reward token that earns you a share of all future protocol revenue.
          </p>
        </div>

        {/* What is dust */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">What is dust?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Every SPL token account on Solana requires a minimum balance of{' '}
            <strong className="text-gray-700">~0.002 SOL</strong> to exist — this is called{' '}
            <em>rent exemption</em>. Wallets accumulate dozens of accounts holding tiny or zero
            balances from old airdrops, failed trades, or forgotten positions. These accounts lock
            up your SOL even though the tokens inside are worth almost nothing.
          </p>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
            A wallet with <strong className="text-gray-700">20 dust accounts</strong> has{' '}
            <strong className="text-gray-700">~0.04 SOL</strong> locked up — about{' '}
            <strong className="text-gray-700">$6–8</strong> at current prices.
          </div>
        </section>

        {/* Recycling flow */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">How recycling works</h2>
          <ol className="space-y-2 text-sm text-gray-500">
            {([
              ['Scan', 'Connect your wallet. Recycler checks all your token accounts and flags any with a USD value under $0.10 as recyclable.'],
              ['Select', 'Review the list. Deselect any accounts you want to keep. You are always in control — nothing happens without your approval.'],
              ['Approve', 'Click Recycle. A single transaction is sent to your wallet for approval — no repeated popups.'],
              ['Reclaim', 'For each closed account, Solana returns ~0.002 SOL to your wallet. Recycler keeps a 5% platform fee.'],
              ['Earn SMELT', 'After the accounts close, the platform mints SMELT tokens to your wallet as a reward — 250 SMELT per account (halving every 6 months).'],
            ] as [string, string][]).map(([title, desc], i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span><strong className="text-gray-700">{title}:</strong> {desc}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* SMELT */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">What is SMELT?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT is the platform reward token. You earn it every time you recycle accounts. Emission
            starts at <strong className="text-gray-700">250 SMELT per account</strong> and halves
            every 6 months — similar to Bitcoin&apos;s halving schedule, so early recyclers earn the most.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT holders receive a proportional share of all accumulated protocol SOL (recycling fees,
            vault liquidations, and direct donations) in regular distributions every epoch (48 hours).
            The more SMELT you hold or stake, the larger your share.
          </p>
        </section>

        {/* Staking */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Staking</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            You can stake your SMELT on the{' '}
            <a href="/stake" className="text-green-600 font-medium hover:underline">Stake page</a>{' '}
            to participate in distributions. Staking is proportional — if you hold 1% of all staked
            SMELT, you receive 1% of the epoch&apos;s distributable SOL.
          </p>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500 space-y-1">
            <div><strong className="text-gray-700">Epoch</strong> — 48 hours. Each epoch accumulates fees, liquidations, and donations, then distributes the total to stakers.</div>
            <div><strong className="text-gray-700">Your share</strong> — your staked SMELT ÷ total staked SMELT × 100%.</div>
          </div>
        </section>

        {/* The Vault & Liquidations */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">The Vault &amp; liquidations</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            When you recycle, your dust tokens are transferred to the platform Vault before their
            accounts are closed. The Vault accumulates tokens over time. When any single token&apos;s
            balance exceeds <strong className="text-gray-700">$10 USD</strong>, it is automatically
            swapped to SOL via Jupiter (best-price DEX routing across all major Solana DEXes) and
            added to the pending distribution pool.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed">
            You can see current vault contents, recent liquidations, and all pending SOL on the{' '}
            <a href="/treasury" className="text-green-600 font-medium hover:underline">Treasury page</a>.
          </p>
        </section>

        {/* Treasury */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Treasury</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            The Treasury page shows the full money flow of the protocol:
          </p>
          <ul className="space-y-1.5 text-sm text-gray-500 pl-4">
            <li><strong className="text-gray-700">Inflows</strong> — recycling fees, token liquidations, and direct SOL donations</li>
            <li><strong className="text-gray-700">Pending</strong> — total SOL sitting ready to distribute at the next epoch</li>
            <li><strong className="text-gray-700">History</strong> — every past distribution, liquidation, and donation on record</li>
          </ul>
        </section>

        {/* Key Addresses */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Key addresses</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            All platform addresses are public and verifiable on-chain. Click any address to copy it, or open in Solscan.
          </p>
          {([
            ['SMELT Mint',     'SME88JJYc8NrRvLVwWUgqk3kLuhuUwqu2JKDFeHdXb8'],
            ['Platform Vault', 'DgkyF4YnwVYFqMSMo9WvDz2sVkFJSjsWueFYDrKgu87Z'],
            ['Staking Pool',   '9TTxxr5tYAdq6HDWMUNRz1xgppBNmrAVzKyarEfhPdok'],
            ['Admin',          '5gGqU2dsfxjjJqpihoPBa7oGRm3bZTFPKaG11hWv8HK5'],
          ] as [string, string][]).map(([label, addr]) => (
            <AddressRow key={addr} label={label} address={addr} />
          ))}
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">FAQ</h2>
          {([
            ['Is it safe?', 'Yes. Every transaction is shown in your wallet for approval before anything happens on-chain. The platform never has custody of your SOL.'],
            ["What's the 5% fee for?", 'It covers platform operating costs and flows directly into the SMELT distribution pool, so stakers benefit from every recycle.'],
            ['Why Jupiter?', 'Jupiter aggregates all major Solana DEXes to find the best swap price for vault tokens, maximising SOL returned to the distribution pool.'],
            ['Can I lose tokens?', 'Only tokens you explicitly select are recycled. Tokens worth more than $0.10 are never flagged — only true dust and empty accounts appear.'],
            ['When are distributions?', 'Every 48 hours (one epoch). You can see the exact countdown and pending amount on the Treasury page.'],
            ['Do I have to stake to get rewards?', 'Yes. Distributions go to stakers only. Holding SMELT without staking does not earn SOL rewards.'],
          ] as [string, string][]).map(([q, a]) => (
            <div key={q} className="rounded-xl bg-white border border-gray-200 px-4 py-3">
              <div className="text-gray-900 text-sm font-medium mb-1">{q}</div>
              <div className="text-gray-500 text-sm leading-relaxed">{a}</div>
            </div>
          ))}
        </section>

      </div>
    </main>
  );
}
