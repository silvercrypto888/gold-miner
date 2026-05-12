"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, SystemProgram, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { GoldMinerIDL } from "@/lib/idl";
import {
  PROGRAM_ID,
  RPC_URL,
  LAMPORTS_PER_SOL,
  getPlayerPda,
  getGameConfigPda,
  getGoldSpotPda,
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
  const [escrowBalance, setEscrowBalance] = useState<number>(0);
  const [goldiumBalance, setGoldiumBalance] = useState<number>(0);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);

  // Initialize program
  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
    if (publicKey && signTransaction) {
      const provider = new AnchorProvider(
        connectionRef.current,
        { publicKey, signTransaction } as any,
        { commitment: "confirmed" }
      );
      programRef.current = new Program(GoldMinerIDL as any, provider);
      fetchPlayerData();
      fetchGameConfig();
    }
  }, [publicKey, signTransaction]);

  // Fetch player data
  const fetchPlayerData = useCallback(async () => {
    if (!publicKey || !programRef.current) return;

    try {
      const [playerPda] = getPlayerPda(publicKey, PROGRAM_ID);
      
      // @ts-ignore
      const account = await programRef.current.account.player.fetch(playerPda);
      if (account) {
        setPlayerAccount(account as PlayerAccount);
        
        // Get escrow balance
        const balance = await connectionRef.current!.getBalance(playerPda);
        const minRent = await connectionRef.current!.getMinimumBalanceForRentExemption(200);
        setEscrowBalance(Math.max(0, balance - minRent));
      }
    } catch (err) {
      // Player doesn't exist
      setPlayerAccount(null);
    }
  }, [publicKey]);

  // Fetch game config
  const fetchGameConfig = useCallback(async () => {
    if (!programRef.current) return;

    try {
      const [configPda] = getGameConfigPda(PROGRAM_ID);
      // @ts-ignore
      const config = await programRef.current.account.gameConfig.fetch(configPda);
      if (config) {
        setGameConfig(config as GameConfigAccount);
      }
    } catch (err) {
      console.log("Game not initialized yet");
    }
  }, []);

  // Deposit XNT
  const depositXnt = useCallback(
    async (amountXnt: number): Promise<TransactionResult> => {
      if (!publicKey || !signTransaction || !programRef.current) {
        return { signature: "", success: false, error: "Wallet not connected" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const [playerPda] = getPlayerPda(publicKey, PROGRAM_ID);
        const amountLamports = new BN(amountXnt * LAMPORTS_PER_SOL);

        const tx = await programRef.current.methods
          .depositXnt(amountLamports)
          .accounts({
            wallet: publicKey,
            player: playerPda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        tx.feePayer = publicKey;
        tx.recentBlockhash = (
          await connectionRef.current!.getLatestBlockhash()
        ).blockhash;

        const signed = await signTransaction(tx);
        const signature = await connectionRef.current!.sendRawTransaction(
          signed.serialize()
        );

        await connectionRef.current!.confirmTransaction(signature);
        await fetchPlayerData();

        return { signature, success: true };
      } catch (err: any) {
        const msg = err.message || "Deposit failed";
        setError(msg);
        return { signature: "", success: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, signTransaction, fetchPlayerData]
  );

  // Withdraw all XNT
  const withdrawXnt = useCallback(async (): Promise<TransactionResult> => {
    if (!publicKey || !signTransaction || !programRef.current) {
      return { signature: "", success: false, error: "Wallet not connected" };
    }

    setIsLoading(true);
    setError(null);

    try {
      const [playerPda] = getPlayerPda(publicKey, PROGRAM_ID);

      const tx = await programRef.current.methods
        .withdrawXnt()
        .accounts({
          wallet: publicKey,
          player: playerPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      tx.feePayer = publicKey;
      tx.recentBlockhash = (
        await connectionRef.current!.getLatestBlockhash()
      ).blockhash;

      const signed = await signTransaction(tx);
      const signature = await connectionRef.current!.sendRawTransaction(
        signed.serialize()
      );

      await connectionRef.current!.confirmTransaction(signature);
      await fetchPlayerData();

      return { signature, success: true };
    } catch (err: any) {
      const msg = err.message || "Withdrawal failed";
      setError(msg);
      return { signature: "", success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, fetchPlayerData]);

  // Get Goldium token balance
  const fetchGoldiumBalance = useCallback(async () => {
    if (!publicKey || !gameConfig) return;

    try {
      const tokenAccount = getAssociatedTokenAddressSync(
        new PublicKey(gameConfig.goldiumMint),
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const account = await connectionRef.current!.getTokenAccountBalance(
        tokenAccount
      );
      setGoldiumBalance(Number(account.value.uiAmountString || "0"));
    } catch (err) {
      setGoldiumBalance(0);
    }
  }, [publicKey, gameConfig]);

  return {
    playerAccount,
    gameConfig,
    escrowBalance,
    goldiumBalance,
    isLoading,
    error,
    depositXnt,
    withdrawXnt,
    fetchPlayerData,
    fetchGameConfig,
    fetchGoldiumBalance,
    refresh: fetchPlayerData,
  };
}
