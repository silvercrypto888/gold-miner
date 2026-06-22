"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  getProgramId,
  getTreasuryPda,
  getTreasuryGoldAta,
  getToken2022ProgramId,
  getGameConfigPda,
  RPC_URL,
  AMM_PROGRAM_ID,
  AMM_MARKET_AUTHORITY,
  AMM_CONFIG,
  AMM_POOL_STATE,
  AMM_GOLD_VAULT,
  AMM_XNT_VAULT,
  AMM_OBSERVER_STATE,
  AMM_GOLD_MINT,
  AMM_XNT_MINT,
  AMM_LP_MINT,
  AMM_XNT_TOKEN_PROG,
  AMM_GOLD_TOKEN_PROG,
  AMM_LP_TOKEN_PROG,
  INCINERATOR,
  getTreasuryXntAta,
  getTreasuryLpAta,
  getIncineratorLpAta,
  getAtaProgramId,
} from "@/lib/constants";

// treasury_auto_lp discriminator = sha256("global:treasury_auto_lp")[0..8]
const TREASURY_AUTO_LP_DISC = new Uint8Array([88, 214, 22, 127, 104, 230, 169, 225]);

export function TreasuryPanel() {
  const { publicKey, signTransaction } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [goldBalance, setGoldBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const connRef = useRef<Connection | null>(null);

  useEffect(() => {
    if (!connRef.current) connRef.current = new Connection(RPC_URL, "confirmed");
  }, []);

  const fetchTreasuryBalance = useCallback(async () => {
    if (!connRef.current) return;
    try {
      const programId = getProgramId();
      const [treasuryPda] = getTreasuryPda(programId);
      const [gameConfigPda] = getGameConfigPda(programId);

      // Read gold_mint from game config
      const configInfo = await connRef.current.getAccountInfo(gameConfigPda);
      if (!configInfo) { setGoldBalance(0); return; }
      const goldMint = new PublicKey(configInfo.data.slice(44, 76));

      const treasuryGoldAta = getTreasuryGoldAta(treasuryPda, goldMint);
      const account = await connRef.current.getTokenAccountBalance(treasuryGoldAta);
      setGoldBalance(Number(account.value.uiAmountString || "0"));
    } catch {
      setGoldBalance(0);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchTreasuryBalance();
  }, [isOpen, fetchTreasuryBalance]);

  const handleAutoLp = async () => {
    if (!publicKey || !signTransaction || !connRef.current) {
      setTxStatus("Wallet not connected");
      return;
    }
    setIsLoading(true);
    setTxStatus("Sending Treasury → LP...");
    try {
      const programId = getProgramId();
      const [treasuryPda] = getTreasuryPda(programId);
      const [gameConfigPda] = getGameConfigPda(programId);
      const treasuryGoldAta = getTreasuryGoldAta(treasuryPda, AMM_GOLD_MINT);
      const treasuryXntAta = getTreasuryXntAta(treasuryPda);
      const treasuryLpAta = getTreasuryLpAta(treasuryPda);

      const data = Buffer.concat([Buffer.from(TREASURY_AUTO_LP_DISC)]);

      const incineratorLpAta = getIncineratorLpAta();
      const ataProgramId = getAtaProgramId();

      const keys = [
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: AMM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: AMM_MARKET_AUTHORITY, isSigner: false, isWritable: true },
        { pubkey: AMM_CONFIG, isSigner: false, isWritable: true },
        { pubkey: AMM_POOL_STATE, isSigner: false, isWritable: true },
        { pubkey: AMM_GOLD_VAULT, isSigner: false, isWritable: true },
        { pubkey: AMM_XNT_VAULT, isSigner: false, isWritable: true },
        { pubkey: AMM_OBSERVER_STATE, isSigner: false, isWritable: true },
        { pubkey: treasuryGoldAta, isSigner: false, isWritable: true },
        { pubkey: treasuryXntAta, isSigner: false, isWritable: true },
        { pubkey: treasuryLpAta, isSigner: false, isWritable: true },
        { pubkey: AMM_GOLD_MINT, isSigner: false, isWritable: false },
        { pubkey: AMM_XNT_MINT, isSigner: false, isWritable: false },
        { pubkey: AMM_LP_MINT, isSigner: false, isWritable: true },
        { pubkey: AMM_GOLD_TOKEN_PROG, isSigner: false, isWritable: false },
        { pubkey: AMM_XNT_TOKEN_PROG, isSigner: false, isWritable: false },
        { pubkey: AMM_LP_TOKEN_PROG, isSigner: false, isWritable: false },
        { pubkey: incineratorLpAta, isSigner: false, isWritable: true },
        { pubkey: ataProgramId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const ix = new TransactionInstruction({
        programId,
        keys,
        data,
      });

      const tx = new Transaction({ feePayer: publicKey });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
      tx.add(ix);
      const blockhash = await connRef.current.getLatestBlockhash();
      tx.recentBlockhash = blockhash.blockhash;
      tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;

      const signed = await signTransaction(tx);
      const sig = await connRef.current.sendRawTransaction(signed.serialize());
      await connRef.current.confirmTransaction(sig);

      setTxStatus(`✅ LP done! TX: ${sig.slice(0, 8)}...`);
      setTimeout(() => setTxStatus(null), 8000);
      fetchTreasuryBalance();
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes("InsufficientGoldForLp") || msg.includes("0x1777")) {
        setTxStatus("⚠️ Not enough GOLD in treasury (need 1,000+)");
      } else if (msg.includes("InsufficientLpMinted") || msg.includes("0x1778")) {
        setTxStatus("⚠️ LP tokens too small to burn");
      } else if (msg.includes("User rejected")) {
        setTxStatus("Cancelled");
      } else {
        setTxStatus(`❌ ${msg.slice(0, 60)}`);
      }
      setTimeout(() => setTxStatus(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
      >
        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
          <span>🏦</span> Game Treasury
        </h3>
        <span className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {/* GOLD Balance */}
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
            <div className="text-xs text-gray-500 mb-1">GOLD Balance</div>
            <div className="text-lg font-bold text-yellow-400">
              {goldBalance === null ? (
                <span className="text-gray-500 animate-pulse">Loading...</span>
              ) : (
                `${goldBalance.toLocaleString()} GOLD`
              )}
            </div>
          </div>

          {/* Treasury → LP Button */}
          <button
            onClick={handleAutoLp}
            disabled={isLoading || goldBalance === null}
            className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
              isLoading
                ? "bg-yellow-600/30 text-yellow-400/50 cursor-not-allowed"
                : "bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400 active:scale-[0.98]"
            }`}
          >
            {isLoading ? "Processing..." : "Treasury → LP"}
          </button>

          {/* Status message */}
          {txStatus && (
            <div className="text-xs text-center text-gray-400 animate-pulse">
              {txStatus}
            </div>
          )}

          {/* Info text */}
          <div className="text-xs text-gray-500">
            <p>Swaps ~50% of treasury GOLD for XNT, deposits both as LP, and burns the LP tokens.</p>
            <p className="mt-1">Requires at least 1,000 GOLD in the treasury.</p>
          </div>
        </div>
      )}
    </div>
  );
}
