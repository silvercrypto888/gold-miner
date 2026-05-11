"use client";

import { WalletProvider } from "@/components/WalletProvider";
import { GameCanvas } from "@/components/GameCanvas";
import { PlayerHUD } from "@/components/PlayerHUD";
import { DepositButtons } from "@/components/DepositButtons";
import { Leaderboard } from "@/components/Leaderboard";

export default function Home() {
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
                <p className="text-xs text-gray-400">On-Chain Grid Game on X1</p>
              </div>
            </div>
            <PlayerHUD />
          </div>
        </header>

        {/* Main Game Area */}
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Game Canvas */}
            <div className="lg:col-span-3">
              <GameCanvas />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <DepositButtons />
              <Leaderboard />
              
              {/* Instructions */}
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <h3 className="font-semibold text-gray-200 mb-2">How to Play</h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Use Arrow Keys or WASD to move</li>
                  <li>• Find gold squares (yellow glow)</li>
                  <li>• Step on gold to mine it</li>
                  <li>• Earn 100 GLD per mine</li>
                  <li>• Deposit XNT for gas fees</li>
                </ul>
                <div className="mt-3 text-xs text-gray-500">
                  <p>Gold formula: (x &amp; y) % 7 == 0</p>
                  <p>~1,400 gold spots on the grid</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </WalletProvider>
  );
}
