// app/how-it-works/page.tsx
export default function HowItWorksPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">How it works</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Recycler helps you clean up your Solana wallet and reclaim locked SOL — with a small
            reward token (SMELT) for every account you close.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">What is dust?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Every SPL token account on Solana requires a minimum balance of ~<strong className="text-gray-700">0.002 SOL</strong> to
            exist — this is called <em>rent exemption</em>. Over time, wallets accumulate dozens of
            accounts holding tiny or zero balances from old airdrops, failed trades, or forgotten
            positions. These accounts lock up your SOL even though the tokens inside are worth
            almost nothing.
          </p>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
            A wallet with <strong className="text-gray-700">20 dust accounts</strong> has{' '}
            <strong className="text-gray-700">~0.04 SOL</strong> locked up — about{' '}
            <strong className="text-gray-700">$6–8</strong> at current prices.
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">How recycling works</h2>
          <ol className="space-y-2 text-sm text-gray-500">
            {([
              ['Scan', 'Connect your wallet. Recycler checks all your token accounts and flags any with a USD value under $0.10 as recyclable.'],
              ['Select', 'Review the list. Deselect any accounts you want to keep. You are always in control.'],
              ['Approve', 'Click Recycle. One transaction is sent to Phantom for your approval — no repeated popups.'],
              ['Reclaim', 'For each closed account, Solana returns ~0.002 SOL to your wallet. Recycler keeps a 5% platform fee.'],
              ['Earn SMELT', 'After closing, the platform mints SMELT tokens to your wallet as a reward.'],
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">What is SMELT?</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT is the platform reward token. You earn it every time you recycle accounts. The
            emission rate starts at <strong className="text-gray-700">250 SMELT per account</strong> and
            halves every 6 months — similar to Bitcoin&apos;s halving schedule.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed">
            SMELT holders receive a proportional share of the platform&apos;s accumulated SOL (from
            liquidations and recycling fees) in regular distributions. The{' '}
            <strong className="text-gray-700">NAV</strong> (Net Asset Value) shown in the nav bar is
            the current SOL value of the pending pool divided by total circulating supply — it tells
            you exactly what each SMELT token is worth right now.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">The Vault</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            When you recycle, your dust tokens are transferred to the platform Vault before the
            account is closed. The Vault accumulates tokens over time. When any single token&apos;s
            balance exceeds <strong className="text-gray-700">$10 USD</strong>, it is automatically
            swapped to SOL via Jupiter (best-price DEX routing on Solana) and added to the
            distribution pool.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Distributions</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Accumulated SOL — from vault liquidations and the 5% recycling fee — is distributed
            weekly to all SMELT token holders. Your share is proportional to your holdings.
            Staked SMELT earns a <strong className="text-gray-700">1.5× weight boost</strong>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">FAQ</h2>
          {([
            ['Is it safe?', 'Yes. Every transaction is shown in Phantom for your approval before anything happens on-chain. The platform never has custody of your SOL.'],
            ["What's the 5% fee for?", 'It covers platform operating costs and flows into the SMELT distribution pool, so SMELT holders benefit directly from recycling activity.'],
            ['Why Jupiter?', 'Jupiter aggregates all major Solana DEXes to find the best swap price for vault tokens. This maximises SOL returned to the distribution pool.'],
            ['Can I lose tokens?', 'Only tokens you explicitly select are recycled. Tokens worth more than $0.10 are never shown as recyclable — only true dust and empty accounts appear.'],
            ['When are distributions?', 'Approximately weekly. You can see the next scheduled date in the Pools page.'],
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
