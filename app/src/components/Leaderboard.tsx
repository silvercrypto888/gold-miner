"use client";

import { useState, useEffect, useRef } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useSessionKey } from "@/hooks/useSessionKey";
import { LeaderboardEntry } from "@/types";
import { shortenAddress, formatGoldium } from "@/lib/utils";
import { getProgramId, RPC_URL } from "@/lib/constants";

// Player discriminator = sha256("account:Player")[0:8]
const PLAYER_DISC_B58 = "bSBoKNsSHuj"; // base58 of [205,222,112,7,165,155,206,218]
const PLAYER_SIZE = 97; // 8 disc + 32 wallet + 32 session_key + 4 pos_x + 4 pos_y + 8 goldium + 8 expires + 1 bump

export function Leaderboard() {
  const { playerState } = useSessionKey();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const connRef = useRef<Connection | null>(null);

  const loadLeaderboard = async () => {
    if (!connRef.current) connRef.current = new Connection(RPC_URL);

    setIsLoading(true);
    try {
      const programId = getProgramId();
      const accounts = await connRef.current.getProgramAccounts(programId, {
        filters: [
          { memcmp: { offset: 0, bytes: PLAYER_DISC_B58 } },
          { dataSize: PLAYER_SIZE },
        ],
        commitment: "confirmed",
      });

      const scanned = new Map<string, bigint>();

      for (const { account } of accounts) {
        const data = account.data;
        if (data.readUInt16LE(0) !== 0xdecd) continue;

        const wallet = new PublicKey(data.slice(8, 40)).toBase58();
        const posX = data.readUInt32LE(72);
        const posY = data.readUInt32LE(76);
        const goldiumMinted = data.readBigUInt64LE(80);

        // If same wallet has multiple PDAs (shouldn't but be safe), keep the highest
        if (!scanned.has(wallet) || goldiumMinted > scanned.get(wallet)!) {
          scanned.set(wallet, goldiumMinted);
        }
      }

      const sorted: LeaderboardEntry[] = Array.from(scanned.entries())
        .sort((a, b) => {
          if (b[1] > a[1]) return 1;
          if (b[1] < a[1]) return -1;
          return 0;
        })
        .slice(0, 50)
        .map(([wallet, gold]) => ({
          wallet,
          goldiumMinted: Number(gold),
          position: { x: 0, y: 0 },
        }));

      setEntries(sorted);
    } catch (err) {
      console.error("Leaderboard fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  // Current player's rank
  const playerWallet = playerState?.wallet?.toBase58();
  const playerRank = playerWallet
    ? entries.findIndex((e) => e.wallet === playerWallet) + 1
    : null;

  // Top 10 entries for display
  const topEntries = entries.slice(0, 10);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
      >
        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
          <span>🏆</span> Leaderboard
          {isLoading && (
            <span className="text-xs text-gray-500 animate-pulse">loading...</span>
          )}
        </h3>
        <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          {entries.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No players yet</p>
          ) : (
            <div className="space-y-1">
              {topEntries.map((entry, index) => (
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
          )}

          {/* Current player rank */}
          {playerState && playerRank && playerRank > 10 && (
            <>
              {entries.length > 0 && <div className="my-3 border-t border-gray-700"></div>}
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

          <button
            onClick={loadLeaderboard}
            disabled={isLoading}
            className="mt-3 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}