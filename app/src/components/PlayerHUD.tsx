"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useGoldMiner } from "@/hooks/useGoldMiner";
import { useGame } from "@/hooks/useGame";
import { formatXNT, formatGoldium } from "@/lib/constants";
import { shortenAddress, getTimeRemaining } from "@/lib/utils";

export function PlayerHUD() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible, visible } = useWalletModal();
  const { sessionPubkey, playerState, isSessionValid, clearSession } =
    useSessionKey();
  const { goldMined } = useGame();
  const { goldiumBalance, fetchGoldiumBalance } = useGoldMiner();

  if (!publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-medium py-2 px-6 rounded-lg transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Stats */}
      <div className="hidden sm:flex items-center gap-4">
        {playerState && (
          <>
            <div className="text-right">
              <div className="text-xs text-gray-400">GLD Mined</div>
              <div className="text-sm font-bold text-yellow-400">
                {formatGoldium(goldMined)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Session indicator */}
      {sessionPubkey && (
        <div
          className={`hidden md:block px-3 py-1 rounded-full text-xs font-medium ${
            isSessionValid()
              ? "bg-green-500/20 text-green-400 border border-green-500/50"
              : "bg-red-500/20 text-red-400 border border-red-500/50"
          }`}
        >
          {isSessionValid() ? "Session Active" : "Session Expired"}
        </div>
      )}

      {/* Wallet info */}
      <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-2 border border-gray-700">
        <div className="text-right">
          <div className="text-sm font-medium text-white">
            {shortenAddress(publicKey.toString())}
          </div>
          <div className="text-xs text-gray-400">Connected</div>
        </div>
        <button
          onClick={() => {
            clearSession();
            disconnect();
          }}
          className="text-gray-400 hover:text-white transition-colors"
          title="Disconnect"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}