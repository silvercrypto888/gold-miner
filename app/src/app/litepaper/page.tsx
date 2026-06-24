"use client";

import Link from "next/link";

export default function LitepaperPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Gold Miner
        </Link>

        <h1 className="text-4xl font-extrabold text-yellow-400 mb-2">
          Gold Miner
        </h1>
        <p className="text-lg text-gray-400 mb-12">Litepaper</p>

        {/* Overview */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            1. Overview
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Gold Miner is a fully on-chain, fair-launch blockchain game built on the
            <strong> X1 Blockchain</strong> (Solana Virtual Machine). Players explore a 1,024 × 1,024
            procedurally generated world, discover gold deposits using deterministic world-generation
            logic, and earn <strong>GOLD</strong> tokens with every successful mine.
          </p>
          <p className="text-gray-300 leading-relaxed">
            The game is designed as a <strong>zero-developer-fee, zero-developer-preallocation</strong> 
            protocol. Every GOLD token minted through gameplay flows into the protocol treasury,
            where it is used to deepen and permanently burn liquidity — directly benefiting the
            entire ecosystem.
          </p>
        </section>

        {/* Game Mechanics */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            2. Game Mechanics
          </h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 leading-relaxed">
            <li>
              <strong>World Size:</strong> 1,024 × 1,024 grid (~1,048,576 cells).
            </li>
            <li>
              <strong>Gold Discovery:</strong> Gold exists where <code>(x &amp; y) % 7 === 0</code>,
              yielding approximately 150,000 gold spots across the map.
            </li>
            <li>
              <strong>Mining Reward:</strong> Each valid gold mine yields <strong>100 GOLD</strong> tokens.
            </li>
            <li>
              <strong>Session Keys:</strong> Players use ephemeral session keys for gasless, fast in-game
              movement and mining. Session keys expire after ~4 hours (36,000 slots) and can be topped
              up with XNT gas.
            </li>
            <li>
              <strong>Deposit &amp; Withdraw:</strong> Players deposit XNT to create a session. Unspent
              session gas can be swept back to the player&apos;s wallet at any time.
            </li>
          </ul>
        </section>

        {/* Tokenomics */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            3. Tokenomics &amp; Fair Launch
          </h2>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5 mb-6">
            <h3 className="text-lg font-semibold text-yellow-300 mb-3">
              No Developer Preallocation
            </h3>
            <p className="text-gray-300 leading-relaxed">
              The developers received <strong>zero</strong> GOLD tokens at launch. There is no team
              allocation, no seed round, no VC allocation, and no advisor vesting. Every GOLD token
              in circulation was minted through on-chain gameplay.
            </p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5 mb-6">
            <h3 className="text-lg font-semibold text-yellow-300 mb-3">
              No Developer Fee
            </h3>
            <p className="text-gray-300 leading-relaxed">
              The protocol does not collect a developer fee from player deposits, mining rewards, or
              treasury operations. 100% of all on-chain economic value remains within the player-owned
              treasury and liquidity system.
            </p>
          </div>
          <ul className="list-disc list-inside text-gray-300 space-y-2 leading-relaxed">
            <li>
              <strong>Total Supply:</strong> Uncapped — limited only by total gold spots (~15 million
              GOLD theoretical max at 100 GOLD per mine). Respawning of gold spots may be permitted if 
              sufficiently many are mined.
            </li>
            <li>
              <strong>Minting:</strong> Only via on-chain <code>move_and_mine</code> instructions.
              No manual mint authority exists.
            </li>
            <li>
              <strong>Token Standard:</strong> Token-2022 (SPL Token-2022) on X1 Blockchain.
            </li>
          </ul>
        </section>

        {/* Liquidity & Burn */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            4. Liquidity &amp; Burn Mechanism
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            All GOLD tokens minted into the game treasury are deployed to deepen protocol-owned
            liquidity on the native X1 DEX. The treasury periodically pairs GOLD with XNT and
            deposits liquidity into a CPMM pool. Every time a gold spot is mined, 100 GOLD is 
            minted into the treasury.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Upon reaching predefined thresholds, the protocol executes an <strong>auto-LP burn</strong>:
            the treasury mints LP tokens and sends them permanently to an incinerator address
            (<code>1nc1nerator11111111111111111111111111111111</code>), removing them from circulation
            forever. This creates <strong>deflationary pressure</strong> and benefits all token holders by
            permanently locking liquidity.
          </p>
          <p className="text-gray-300 leading-relaxed">
            In summary: <strong>the more people play and mine, the deeper and more permanent the
            liquidity becomes</strong> — with no extraction to developers or insiders.
          </p>
        </section>

        {/* Treasury */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            5. On-Chain Treasury
          </h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 leading-relaxed">
            <li>
              <strong>Treasury PDA:</strong> A program-derived account owned by the Gold Miner Anchor
              program. It holds player deposits and mined GOLD.
            </li>
            <li>
              <strong>Slippage Protection:</strong> Treasury operations (LP deposits, burns) enforce
              on-chain slippage limits to protect against MEV and price manipulation.
            </li>
            <li>
              <strong>Transparency:</strong> All treasury balances, LP positions, and burn transactions
              are fully visible on-chain via the X1 Explorer.
            </li>
          </ul>
        </section>

        {/* Technology */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            6. Technology Stack
          </h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 leading-relaxed">
            <li>
              <strong>Blockchain:</strong> X1 Blockchain (Solana Virtual Machine, Chain ID 204005)
            </li>
            <li>
              <strong>Smart Contracts:</strong> Anchor Framework (Rust)
            </li>
            <li>
              <strong>Frontend:</strong> Next.js 14, React, Tailwind CSS
            </li>
            <li>
              <strong>Wallet Adapters:</strong> Solana Wallet Adapter (Backpack, Phantom, Solflare,
              wallet-standard)
            </li>
            <li>
              <strong>Token Standard:</strong> SPL Token-2022
            </li>
            <li>
              <strong>World State:</strong> On-chain bitmap account (131,072 bytes) tracking mined cells
            </li>
          </ul>
        </section>

        {/* Roadmap */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            7. Roadmap
          </h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 leading-relaxed">
            <li>
              <strong>Phase 1 — Live:</strong> Core mining, session keys, leaderboard, treasury auto-LP
              with on-chain slippage protection.
            </li>
            <li>
              <strong>Phase 2 — Planned:</strong> GOLD utility beyond the game. Possibly including GOLD NFTs
              or similar collectibles.
            </li>
          </ul>
        </section>

        {/* Legal Disclaimers */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
            8. Legal Disclaimers
          </h2>
          <div className="space-y-4 text-gray-400 text-sm leading-relaxed">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Not Financial Advice
              </h3>
              <p>
                This litepaper is for informational purposes only and does not constitute financial
                advice, investment advice, trading advice, or any other sort of advice. You should not
                treat any of the content as such. Do your own research and consult a professional
                financial advisor before making any investment decisions.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Regulatory Compliance
              </h3>
              <p>
                GOLD tokens are utility tokens designed for in-game use within the Gold Miner protocol.
                They are not securities, commodities, or investment contracts. The developers make no
                representation that GOLD or related activities comply with the laws of any
                jurisdiction. It is your responsibility to ensure your participation complies with
                applicable local, state, national, and international laws and regulations.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Risk Disclosure
              </h3>
              <p>
                Blockchain gaming and cryptocurrency tokens involve substantial risk, including but not
                limited to: total loss of funds, smart contract vulnerabilities, protocol exploits,
                network downtime, regulatory action, and market volatility. The developers are not
                liable for any losses incurred through participation in the Gold Miner protocol.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                No Guarantee of Value
              </h3>
              <p>
                There is no guarantee that GOLD tokens will have any value, liquidity, or utility outside
                the Gold Miner game. Token prices may fluctuate significantly. Past performance of
                similar projects is not indicative of future results.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Smart Contract Risk
              </h3>
              <p>
                Despite best efforts in development and testing, smart contracts may contain bugs,
                vulnerabilities, or unexpected behavior. The code is deployed on-chain and
                immutable (or governed by the protocol). By interacting with the contracts, you
                acknowledge and accept these risks.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Intellectual Property
              </h3>
              <p>
                All game design, code, artwork, and branding are the property of the Gold Miner
                developers and contributors. Unauthorized reproduction, distribution, or derivative
                works are prohibited without explicit written permission.
              </p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
              <h3 className="text-base font-semibold text-gray-300 mb-2">
                Changes &amp; Updates
              </h3>
              <p>
                This litepaper may be updated at any time without notice. The protocol, game mechanics,
                tokenomics, and roadmap are subject to change based on community feedback, technical
                requirements, or regulatory considerations.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-700 text-center text-gray-500 text-sm">
          <p>© 2026 Gold Miner. All rights reserved.</p>
          <p className="mt-2">Built on X1 Blockchain.</p>
          <Link
            href="/"
            className="inline-block mt-4 text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            Return to Game →
          </Link>
        </footer>
      </div>
    </main>
  );
}
