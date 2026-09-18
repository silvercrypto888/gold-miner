"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useGoldMiner } from "@/hooks/useGoldMiner";
import { formatXNT, formatGoldium } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import { isWalletConnectLockedOnMobile } from "@/lib/utils";

export function PlayerHUD() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible, visible } = useWalletModal();
  const {
    sessionPubkey,
    playerState,
    isSessionValid,
    clearSession,
    sweepSessionKey,
    topUpSession,
    topUpStatus,
  } = useSessionKey();
  const { goldiumBalance, fetchGoldiumBalance } = useGoldMiner();
  const [sweepStatus, setSweepStatus] = useState<string | null>(null);
  const isToppingUp = topUpStatus === "Topping up...";
  const isSweeping = sweepStatus === "Sweeping...";

  // Poll GOLD balance every 5s
  useEffect(() => {
    if (!publicKey) return;
    fetchGoldiumBalance();
    const interval = setInterval(fetchGoldiumBalance, 5000);
    return () => clearInterval(interval);
  }, [publicKey, fetchGoldiumBalance]);

  const handleWithdraw = useCallback(async () => {
    setSweepStatus("Sweeping...");
    const result = await sweepSessionKey();
    if (result.ok) {
      setSweepStatus("Withdrawn ✓");
    } else if (result.ok === false) {
      if (result.reason === "no_key" || result.reason === "no_funds") {
        setSweepStatus("Nothing to withdraw");
      } else {
        setSweepStatus("Error: " + (result.detail || result.reason));
      }
    }
    setTimeout(() => setSweepStatus(null), 3000);
  }, [sweepSessionKey]);

  if (!publicKey) {
    // On mobile, wallet connect is temporarily locked (Silver's decision 2026-09-18).
    // Show a disabled state / notice instead of the Connect button.
    if (isWalletConnectLockedOnMobile()) {
      return (
        <span
          className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800/60 px-4 py-2 text-gray-500"
          title="Wallet connect is not supported on mobile yet — play on desktop."
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Desktop only
        </span>
      );
    }
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
    <div className="flex items-center gap-3">
      {/* GOLD in Wallet (ATA balance) */}
      <div className="text-right">
        <div className="text-xs text-gray-400">GOLD in Wallet</div>
        <div className="text-sm font-bold text-yellow-400">
          {formatGoldium(goldiumBalance)}
        </div>
      </div>

      {/* Session indicator + withdraw */}
      {sessionPubkey && (
        <div className="flex items-center gap-1.5">
          <div
            className={`hidden md:block px-2.5 py-1 rounded-full text-xs font-medium ${
              isSessionValid()
                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-red-500/20 text-red-400 border border-red-500/50"
            }`}
          >
            {isSessionValid() ? "Session Active" : "Session Expired"}
          </div>
          <button
            onClick={handleWithdraw}
            disabled={isSweeping}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              isSweeping
                ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
            title="Withdraw remaining XNT from session key"
          >
            {sweepStatus || "Withdraw"}
          </button>
          <button
            onClick={topUpSession}
            disabled={isToppingUp}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              isToppingUp
                ? "bg-yellow-900/50 text-yellow-700 cursor-not-allowed"
                : "bg-yellow-700 hover:bg-yellow-600 text-yellow-300"
            }`}
            title="Send 0.2 XNT to session key (max 0.5 XNT total)"
          >
            {topUpStatus || "Top Up"}
          </button>
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