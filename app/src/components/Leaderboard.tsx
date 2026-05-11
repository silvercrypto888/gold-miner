"use client";

import { useState, useEffect } from "react";
import { useSessionKey } from "@/hooks/useSessionKey";
import { LeaderboardEntry } from "@/types";
import { shortenAddress, formatGoldium } from "@/lib/utils";

// Mock data - in production, this would come from a leaderboard API
const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { wallet: "5xrt...a1b2", goldiumMinted: 4500, position: { x: 42, y: 63 } },
  { wallet: "3jkl...c3d4", goldiumMinted: 3200, position: { x: 17, y: 28 } },
  { wallet: "8mno...e5f6", goldiumMinted: 2800, position: { x: 91, y: 15 } },
  { wallet: "2pqr...g7h8", goldiumMinted: 2100, position: { x: 55, y: 77 } },
  { wallet: "9stu...i9j0", goldiumMinted: 1800, position: { x: 33, y: 44 } },
  { wallet: "1vwx...k1l2", goldiumMinted: 1500, position: { x: 88, y: 22 } },
  { wallet: "4yz1...m3n4", goldiumMinted: 1200, position: { x: 12, y: 89 } },
  { wallet: "7opq...o5p6", goldiumMinted: 900, position: { x: 66, y: 33 } },
  { wallet: "0rst...q7r8", goldiumMinted: 600, position: { x: 44, y: 56 } },
  { wallet: "6uvw...s9t0", goldiumMinted: 300, position: { x: 77, y: 11 } },
];

export function Leaderboard() {
  const { playerState } = useSessionKey();
  const [entries, setEntries] = useState<LeaderboardEntry[]>(MOCK_LEADERBOARD);
  const [isLoading, setIsLoading] = useState(false);

  // In a real implementation, fetch from an API
  useEffect(() => {
    // This would fetch real leaderboard data
    // fetchLeaderboard().then(setEntries);
  }, []);

  // Calculate player rank if they exist
  const playerRank = playerState
    ? entries.findIndex(
        (e) => e.wallet === playerState.wallet.toString()
      ) + 1 || entries.length + 1
    : null;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
          <span>🏆</span> Leaderboard
        </h3>
        <div className="text-xs text-gray-500">Top Miners</div>
      </div>

      <div className="space-y-1">
        {entries.slice(0, 10).map((entry, index) => (
          <div
            key={entry.wallet}
            className={`flex items-center justify-between py-2 px-3 rounded-lg ${
              index === 0
                ? "bg-yellow-500/10 border border-yellow-500/30"
                : index === 1
                ? "bg-gray-400/10 border border-gray-400/30"
                : index === 2
                ? "bg-orange-500/10 border border-orange-500/30"
                : "hover:bg-gray-700/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  index === 0
                    ? "bg-yellow-500 text-yellow-900"
                    : index === 1
                    ? "bg-gray-400 text-gray-900"
                    : index === 2
                    ? "bg-orange-500 text-orange-900"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {index + 1}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200">
                  {shortenAddress(entry.wallet)}
                </div>
                <div className="text-xs text-gray-500">
                  at ({entry.position.x}, {entry.position.y})
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-yellow-400">
                {formatGoldium(entry.goldiumMinted)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Player rank */}
      {playerState && playerRank && (
        <>
          <div className="my-3 border-t border-gray-700"></div>
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-blue-900 text-xs font-bold">
                {playerRank}
              </div>
              <div className="text-sm font-medium text-blue-200">You</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-blue-400">
                {formatGoldium(playerState.goldiumMinted)}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 text-xs text-gray-500 text-center">
        Total gold spots: ~1,400
        <br />
        Formula: (x &amp; y) % 7 == 0
      </div>
    </div>
  );
}
