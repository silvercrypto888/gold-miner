"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Gold Miner
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-yellow-400 mb-2">Terms and Conditions</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: June 24, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Gold Miner (the "Game"), you agree to be bound by these Terms and Conditions.
              If you do not agree, do not use the Game.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Eligibility</h2>
            <p>
              You must be of legal age in your jurisdiction to use the Game. The Game is provided for entertainment
              and experimental purposes only. Participation may involve blockchain transactions and token interactions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Gameplay and Tokens</h2>
            <p>
              GOLD tokens earned in-game have no guaranteed value, utility, or liquidity. They are experimental
              digital collectibles. The game mechanics, reward rates, and tokenomics may change at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Risk Acknowledgment</h2>
            <p>
              Blockchain-based games involve inherent risks including, but not limited to, smart contract vulnerabilities,
              network congestion, token volatility, and loss of funds. Use at your own risk. We do not provide financial advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Photosensitive Epilepsy Warning</h2>
            <p>
              A small percentage of people may experience seizures or discomfort when exposed to certain visual patterns,
              flashing lights, or rapidly changing screen content. If you or anyone in your household has an epileptic
              condition, consult a physician before playing. Discontinue use immediately if you experience dizziness,
              altered vision, eye or muscle twitches, loss of awareness, disorientation, or any involuntary movement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Intellectual Property</h2>
            <p>
              All game content, artwork, code, and branding are owned by the project creators. You may not copy,
              modify, distribute, or create derivative works without explicit permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, the creators and operators of the Game shall not be liable for
              any direct, indirect, incidental, special, or consequential damages arising from your use of the Game.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Game after changes constitutes acceptance
              of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
              in which the project is domiciled, without regard to conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Contact</h2>
            <p>
              For questions about these Terms, reach out via the project's official community channels.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
