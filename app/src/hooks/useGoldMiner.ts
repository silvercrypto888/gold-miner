"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, SystemProgram, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { GoldMinerIDL } from "@/lib/idl";
import {
  getProgramId,
  getToken2022ProgramId,
  getGoldMint,
  getGoldAta,
  RPC_URL,
  LAMPORTS_PER_SOL,
  getPlayerPda,
  getGameConfigPda,
} from "@/lib/constants";
import { PlayerAccount, GameConfigAccount } from "@/lib/idl";
import { shortenAddress } from "@/lib/utils";

export interface TransactionResult {
  signature: string;
  success: boolean;
  error?: string;
}

export function useGoldMiner() {
  const { publicKey, signTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerAccount, setPlayerAccount] = useState<PlayerAccount | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfigAccount | null>(null);
  const [goldiumBalance, setGoldiumBalance] = useState<number>(0);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);

  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL, "confirmed");
    }
    if (publicKey && signTransaction) {
      const provider = new AnchorProvider(
        connectionRef.current,
        { publicKey, signTransaction } as any,
        { commitment: "confirmed" }
      );
      programRef.current = new Program(GoldMinerIDL as any, provider);
    }
  }, [publicKey, signTransaction]);

  useEffect(() => {
    if (publicKey) fetchGoldiumBalance();
  }, [publicKey]);

  const fetchPlayerData = useCallback(async () => {
    if (!publicKey || !programRef.current) return;
    try {
      const [playerPda] = getPlayerPda(publicKey, getProgramId());
      const account = await (programRef.current.account as any).player.fetch(playerPda);
      if (account) {
        setPlayerAccount(account as PlayerAccount);
      }
    } catch {
      setPlayerAccount(null);
    }
  }, [publicKey]);

  const fetchGameConfig = useCallback(async () => {
    if (!programRef.current) return;
    try {
      const [configPda] = getGameConfigPda(getProgramId());
      const config = await (programRef.current.account as any).gameConfig.fetch(configPda);
      if (config) setGameConfig(config as GameConfigAccount);
    } catch {}
  }, []);

  // Fetch GOLD balance — read gold_mint from GameConfig PDA raw
  const fetchGoldiumBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const [configPda] = getGameConfigPda(getProgramId());
      const configInfo = await connectionRef.current!.getAccountInfo(configPda);
      if (!configInfo) { setGoldiumBalance(0); return; }
      // GameConfig v2: discriminator(8) + authority(32) + gridSize(4) + goldMint(32)
      const goldMint = new PublicKey(configInfo.data.slice(44, 76));
      const tokenAccount = getAssociatedTokenAddressSync(goldMint, publicKey, false, getToken2022ProgramId());
      const account = await connectionRef.current!.getTokenAccountBalance(tokenAccount);
      setGoldiumBalance(Number(account.value.uiAmountString || "0"));
    } catch { setGoldiumBalance(0); }
  }, [publicKey]);

  return {
    playerAccount, gameConfig, goldiumBalance,
    isLoading, error,
    fetchPlayerData, fetchGameConfig, fetchGoldiumBalance,
    refresh: fetchPlayerData,
  };
}
