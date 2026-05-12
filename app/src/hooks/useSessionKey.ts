"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  storeSessionKey,
  loadSessionKey,
  clearSessionKey,
  getSessionPublicKey,
} from "@/lib/utils";
import { GoldMinerIDL } from "@/lib/idl";
import {
  getProgramId,
  RPC_URL,
  SESSION_DURATION_SLOTS,
  BLOCK_TIME_MS,
} from "@/lib/constants";
import { PlayerState } from "@/types";

export function useSessionKey() {
  const { publicKey, signTransaction } = useWallet();
  const [sessionKeypair, setSessionKeypair] = useState<nacl.SignKeyPair | null>(
    null
  );
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);

  // Initialize program reference
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
    }
  }, [publicKey, signTransaction]);

  // Load existing session on mount
  useEffect(() => {
    const loaded = loadSessionKey();
    if (loaded) {
      setSessionKeypair(loaded.keypair);
      setSessionExpiry(loaded.expiresAt);
    }
  }, []);

  // Start a new session
  const startSession = useCallback(async () => {
    if (!publicKey || !signTransaction || !programRef.current) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate new session keypair
      const newKeypair = nacl.sign.keyPair();
      const sessionPubkey = new PublicKey(newKeypair.publicKey);

      // Get player PDA
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), publicKey.toBuffer()],
        getProgramId()
      );

      // Check if player exists
      const playerAccount = await connectionRef.current!.getAccountInfo(
        playerPda
      );

      // Start session transaction
      const tx = await programRef.current.methods
        .startSession(sessionPubkey)
        .accounts({
          wallet: publicKey,
          player: playerPda,
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

      // Calculate expiry (4 hours from now)
      const expiresAt = Date.now() + SESSION_DURATION_SLOTS * BLOCK_TIME_MS;

      // Store session key
      storeSessionKey(newKeypair, expiresAt);
      setSessionKeypair(newKeypair);
      setSessionExpiry(expiresAt);

      // Fetch player state
      await refreshPlayerState();
    } catch (err: any) {
      console.error("Failed to start session:", err);
      setError(err.message || "Failed to start session");
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction]);

  // Join game (create player account)
  const joinGame = useCallback(async () => {
    if (!publicKey || !signTransaction || !programRef.current) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), publicKey.toBuffer()],
        getProgramId()
      );

      const tx = await programRef.current.methods
        .joinGame()
        .accounts({
          wallet: publicKey,
          player: playerPda,
          systemProgram: web3.SystemProgram.programId,
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

      // Start session immediately after joining
      await startSession();
    } catch (err: any) {
      console.error("Failed to join game:", err);
      setError(err.message || "Failed to join game");
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, startSession]);

  // Refresh player state from chain
  const refreshPlayerState = useCallback(async () => {
    if (!publicKey || !programRef.current) return;

    try {
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), publicKey.toBuffer()],
        getProgramId()
      );

      // @ts-ignore - accessing account
      const playerAccount = await programRef.current.account.player.fetch(
        playerPda
      );

      if (playerAccount) {
        setPlayerState({
          wallet: new PublicKey(playerAccount.wallet),
          sessionKey: new PublicKey(playerAccount.sessionKey),
          position: {
            x: playerAccount.positionX,
            y: playerAccount.positionY,
          },
          goldiumMinted: Number(playerAccount.goldiumMinted),
          sessionExpiresAt: Number(playerAccount.sessionExpiresAt),
          escrowBalance: 0, // Will be fetched separately
        });
      }
    } catch (err) {
      // Player might not exist yet
      console.log("Player not found:", err);
    }
  }, [publicKey]);

  // Check if player exists and has session
  const checkSession = useCallback(async () => {
    if (!publicKey) return false;

    const loaded = loadSessionKey();
    if (!loaded) return false;

    setSessionKeypair(loaded.keypair);
    setSessionExpiry(loaded.expiresAt);

    await refreshPlayerState();
    return true;
  }, [publicKey, refreshPlayerState]);

  // Clear session
  const clearSession = useCallback(() => {
    clearSessionKey();
    setSessionKeypair(null);
    setSessionExpiry(null);
    setPlayerState(null);
  }, []);

  // Get session public key
  const getSessionPubkey = useCallback((): PublicKey | null => {
    if (!sessionKeypair) return null;
    return getSessionPublicKey(sessionKeypair);
  }, [sessionKeypair]);

  // Check if session is valid
  const isSessionValid = useCallback((): boolean => {
    if (!sessionKeypair || !sessionExpiry) return false;
    return Date.now() < sessionExpiry;
  }, [sessionKeypair, sessionExpiry]);

  return {
    sessionKeypair,
    sessionExpiry,
    sessionPubkey: getSessionPubkey(),
    isSessionValid,
    playerState,
    isLoading,
    error,
    startSession,
    joinGame,
    checkSession,
    refreshPlayerState,
    clearSession,
  };
}
