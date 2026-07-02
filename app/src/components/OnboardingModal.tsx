"use client";

import { useState, useEffect, useRef } from "react";

const ONBOARDING_KEY = "gold-miner-onboarding-v1";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const consented = typeof window !== "undefined" && localStorage.getItem("gold-miner-consent-v1") === "agreed";
    const seenOnboarding = typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY) === "seen";
    if (consented && !seenOnboarding) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(ONBOARDING_KEY, "seen");
    setOpen(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden relative"
      >
        {/* Close X button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10 p-1 rounded-lg hover:bg-gray-700/50"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 px-6 pt-6 pb-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Welcome to Gold Miner</h2>
              <p className="text-xs text-gray-400">Quick setup before you start mining</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Section 1: Wallet Setup */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              1. Get the X1 Wallet
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Gold Miner is on the <strong className="text-white">X1 Blockchain</strong> (Solana VM compatible).
              It uses <strong className="text-white">XNT</strong>, the X1 Native Token, for in-game gas fees.
            </p>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Steps:</p>
              <ol className="text-sm text-gray-300 space-y-1.5 list-decimal list-inside">
                <li>Download the X1 wallet</li>
                <li>Bridge USDC from Solana onto X1 in the wallet</li>
                <li>On X1, swap USDC to XNT inside the wallet</li>
              </ol>
            </div>
            <a
              href="https://chromewebstore.google.com/detail/x1-wallet/kcfmcpdmlchhbikbogddmgopmjbflnae"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors border border-blue-500/50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              X1 Wallet on Chrome
            </a>
          </div>

          {/* Section 2: Session Key */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              2. Deposit Gas Funds
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Before playing: approve the transaction to deposit <strong className="text-white">0.2 XNT</strong> into an encrypted session key, to pay for gas fees. Unused gas funds are withdrawable. Sign the message to unlock the session.
            </p>
          </div>

          {/* Section 3: How to Play */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              3. How to Play
            </h3>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">▸</span>
                  <span>Use <strong className="text-white">WASD</strong> or <strong className="text-white">arrow keys</strong> to move</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">▸</span>
                  <span>Mine <strong className="text-yellow-400">GOLD tokens</strong> by moving onto gold tiles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">▸</span>
                  <span>Moving costs <strong className="text-white">XNT gas</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 mt-0.5">▸</span>
                  <span>Turn <strong className="text-cyan-400">Foresight</strong> on to see ahead for free, then turn it off to move again</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer / Okay button */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-lg font-semibold text-sm bg-yellow-500 hover:bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-500/20 transition-all cursor-pointer"
          >
            Okay, let&apos;s mine!
          </button>
        </div>
      </div>
    </div>
  );
}
