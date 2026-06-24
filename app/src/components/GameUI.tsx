"use client";

import { useState, useEffect } from "react";
import { WalletProvider } from "@/components/WalletProvider";
import { GameCanvas } from "@/components/GameCanvas";
import { PlayerHUD } from "@/components/PlayerHUD";
import { Leaderboard } from "@/components/Leaderboard";
import { TreasuryPanel } from "@/components/TreasuryPanel";
import { useAudio } from "@/hooks/useAudio";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function GameUI() {
  const { soundEnabled, musicEnabled, toggleSound, toggleMusic, playSound } = useAudio();
  const [gasToast, setGasToast] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const lamports = e.detail?.amountLamports ?? 0;
      const xnt = (lamports / LAMPORTS_PER_SOL).toFixed(1);
      setGasToast(`Requested to deposit ${xnt} XNT for gas, withdrawable.`);
      setTimeout(() => setGasToast(null), 5000);
    };
    window.addEventListener("gas-deposit", handler as EventListener);
    return () => window.removeEventListener("gas-deposit", handler as EventListener);
  }, []);
  return (
    <WalletProvider>
      <main className="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
                <span className="text-2xl">⛏️</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent">
                  Gold Miner
                </h1>
                <p className="text-xs text-gray-400">On-Chain Fair Mine Game on X1</p>
              </div>
              {/* Gas deposit toast notification */}
              {gasToast && (
                <div className="ml-3 animate-pulse bg-yellow-600/30 border border-yellow-500/60 rounded-lg px-3 py-1.5">
                  <p className="text-xs text-yellow-300 font-medium whitespace-nowrap">{gasToast}</p>
                </div>
              )}
            </div>
            <PlayerHUD />
          </div>
        </header>

        {/* Main Game Area */}
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Game Canvas */}
            <div className="lg:col-span-3">
              <GameCanvas onPlaySound={playSound} />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <h3 className="font-semibold text-gray-200 mb-2">How to Play</h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Use Arrow Keys or WASD to move</li>
                  <li>• Find gold squares (yellow glow)</li>
                  <li>• Step on gold to mine it</li>
                  <li>• Earn 100 GOLD per mine</li>
                </ul>
                <div className="mt-3 text-xs text-gray-500">
                  <p>Gold formula: (x &amp; y) % 7 == 0</p>
                  <p>~150,000 gold spots on 1024×1024 grid</p>
                </div>
              </div>
              {/* Audio Controls */}
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <h3 className="font-semibold text-gray-200 mb-3">Audio</h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={toggleSound}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg border text-sm transition-all ${
                      soundEnabled
                        ? "bg-green-600/20 border-green-500/50 text-green-400"
                        : "bg-gray-800 border-gray-600 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <span>Sound Effects</span>
                    <span>{soundEnabled ? "🔊" : "🔇"}</span>
                  </button>
                  <button
                    onClick={toggleMusic}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg border text-sm transition-all ${
                      musicEnabled
                        ? "bg-purple-600/20 border-purple-500/50 text-purple-400"
                        : "bg-gray-800 border-gray-600 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <span>Background Music</span>
                    <span>{musicEnabled ? "🎵" : "🔇"}</span>
                  </button>
                </div>
              </div>
              <TreasuryPanel />
              <Leaderboard />
              <a
                href="/litepaper"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium">Gold Miner Litepaper</span>
                <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </WalletProvider>
  );
}