"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useGoldMiner } from "@/hooks/useGoldMiner";
import { DEPOSIT_AMOUNTS, formatXNT } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";

export function DepositButtons() {
  const { publicKey } = useWallet();
  const { escrowBalance, isLoading, error, depositXnt, withdrawXnt } =
    useGoldMiner();
  const [showConfirm, setShowConfirm] = useState<number | null>(null);

  if (!publicKey) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h3 className="font-semibold text-gray-200 mb-2">XNT Escrow</h3>
        <p className="text-sm text-gray-400">Connect wallet to manage your gas funds</p>
      </div>
    );
  }

  const handleDeposit = async (amount: number) => {
    const result = await depositXnt(amount);
    if (result.success) {
      setShowConfirm(null);
    }
  };

  const handleWithdraw = async () => {
    await withdrawXnt();
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-200">XNT Escrow</h3>
        <div className="text-right">
          <div className="text-xs text-gray-400">Balance</div>
          <div className="text-xl font-bold text-white">
            {formatXNT(escrowBalance)}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/50 rounded text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm text-gray-400 mb-2">Deposit XNT for gas:</div>
        <div className="grid grid-cols-3 gap-2">
          {DEPOSIT_AMOUNTS.map((amount) => (
            <button
              key={amount.value}
              onClick={() => setShowConfirm(amount.value)}
              disabled={isLoading}
              className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-3 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {amount.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleWithdraw}
          disabled={isLoading || escrowBalance <= 0}
          className="w-full mt-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          {isLoading ? "Processing..." : "Withdraw All"}
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        <p>Each move costs ~0.002 XNT</p>
        <p>Deposit is held in your player escrow</p>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-2">Confirm Deposit</h3>
            <p className="text-gray-400 mb-4">
              Deposit {showConfirm} XNT into your game escrow?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeposit(showConfirm)}
                disabled={isLoading}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
