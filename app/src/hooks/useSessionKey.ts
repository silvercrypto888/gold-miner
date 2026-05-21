"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  storeSessionKey,
  loadSessionKey,
  clearSessionKey,
  getSessionPublicKey,
} from "@/lib/utils";
import { GoldMinerIDL } from "@/lib/idl";
import {
  getProgramId,
  getGoldMint,
  getGoldAta,
  getToken2022ProgramId,
  RPC_URL,
  SESSION_DURATION_SLOTS,
  BLOCK_TIME_MS,
} from "@/lib/constants";
import { PlayerState } from "@/types";

const SESSION_FUND_LAMPORTS = 0.2 * LAMPORTS_PER_SOL;
const SWEEP_DUST_THRESHOLD = 0.01 * LAMPORTS_PER_SOL;

export function useSessionKey() {
  const { publicKey, signTransaction } = useWallet();
  const [sessionKeypair, setSessionKeypair] = useState<nacl.SignKeyPair | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);
  const playerStateRef = useRef<PlayerState | null>(playerState);
  playerStateRef.current = playerState;

  // Initialize connection + program
  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL, "confirmed");
    }
    if (publicKey && signTransaction && !programRef.current) {
      const provider = new AnchorProvider(
        connectionRef.current,
        { publicKey, signTransaction } as any,
        { commitment: "confirmed" }
      );
      programRef.current = new Program(GoldMinerIDL as any, provider);
    }
  }, [publicKey, signTransaction]);

  // Load existing session
  useEffect(() => {
    const loaded = loadSessionKey();
    if (loaded) {
      setSessionKeypair(loaded.keypair);
      setSessionExpiry(loaded.expiresAt);
    }
  }, []);

  // Refresh on wallet connect
  useEffect(() => {
    if (!publicKey) { setPlayerState(null); return; }
    const timer = setTimeout(() => refreshPlayerState(), 200);
    return () => clearTimeout(timer);
  }, [publicKey]);

  // ── Shared helpers ──

  const refreshPlayerState = useCallback(async () => {
    if (!publicKey || !connectionRef.current) return;
    try {
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), publicKey.toBuffer()],
        getProgramId()
      );
      const accountInfo = await connectionRef.current.getAccountInfo(playerPda, 'confirmed');
      if (accountInfo) {
        const d = accountInfo.data;
        const p = {
          wallet: new PublicKey(d.slice(8, 40)),
          sessionKey: new PublicKey(d.slice(40, 72)),
          position: { x: d.readUInt32LE(72), y: d.readUInt32LE(76) },
          goldiumMinted: Number(d.readBigUInt64LE(80)),
          sessionExpiresAt: Number(d.readBigUInt64LE(88)),
          escrowBalance: 0,
        };
        setPlayerState(p);
      } else {
        setPlayerState(null);
      }
    } catch { /* player may not exist yet */ }
  }, [publicKey]);

  // Fund the session key to SESSION_FUND_LAMPORTS (internal — requires blockhash)
  const fundSessionKey = useCallback(async (
    sessionPubkey: PublicKey, blockhash: string, lastValidBlockHeight: number
  ) => {
    if (!publicKey || !signTransaction) return;
    const balance = await connectionRef.current!.getBalance(sessionPubkey);
    if (balance >= SESSION_FUND_LAMPORTS) return;
    const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
    tx.add(SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: sessionPubkey,
      lamports: SESSION_FUND_LAMPORTS - balance,
    }));
    const signed = await signTransaction(tx);
    const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
    await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  }, [publicKey, signTransaction]);

  // Top up session key to SESSION_FUND_LAMPORTS — user-facing, gets its own blockhash
  const [topUpStatus, setTopUpStatus] = useState<string | null>(null);
  const topUpSession = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !connectionRef.current) { setTopUpStatus("Wallet not connected"); return false; }
    const loaded = loadSessionKey();
    if (!loaded) { setTopUpStatus("No session key"); return false; }
    const spk = new PublicKey(loaded.keypair.publicKey);
    try {
      setTopUpStatus("Topping up...");
      const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
      await fundSessionKey(spk, blockhash, lastValidBlockHeight);
      setTopUpStatus("Topped up ✓");
      setTimeout(() => setTopUpStatus(null), 3000);
      return true;
    } catch (err: any) {
      setTopUpStatus(err?.message?.includes("User rejected") ? "Cancelled" : "Top up failed");
      setTimeout(() => setTopUpStatus(null), 3000);
      return false;
    }
  }, [publicKey, fundSessionKey]);

  // Sweep remaining XNT from session key back to user wallet
  const sweepSessionKey = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !connectionRef.current) return false;
    const loaded = loadSessionKey();
    if (!loaded) return false;
    const naclKp = loaded.keypair;
    const sk = new PublicKey(naclKp.publicKey);
    try {
      const balance = await connectionRef.current.getBalance(sk);
      if (balance <= SWEEP_DUST_THRESHOLD) return false;
      const kp = Keypair.fromSecretKey(naclKp.secretKey);
      const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
      const rentExempt = await connectionRef.current.getMinimumBalanceForRentExemption(0);
      const amount = balance - rentExempt - 10_000;
      if (amount <= 0) return false;
      const tx = new Transaction({ feePayer: sk, blockhash, lastValidBlockHeight });
      tx.add(SystemProgram.transfer({ fromPubkey: sk, toPubkey: publicKey, lamports: amount }));
      tx.sign(kp);
      const sig = await connectionRef.current.sendRawTransaction(tx.serialize());
      await connectionRef.current.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return true;
    } catch { return false; }
  }, [publicKey]);

  // Start a new session (used for renewal too)
  const startSession = useCallback(async () => {
    if (!publicKey || !signTransaction || !programRef.current) { setError("Wallet not connected"); return; }
    await sweepSessionKey();
    setIsLoading(true); setError(null);
    try {
      const nkp = nacl.sign.keyPair();
      const spk = new PublicKey(nkp.publicKey);
      const [ppda] = PublicKey.findProgramAddressSync([Buffer.from("player"), publicKey.toBuffer()], getProgramId());
      const { blockhash, lastValidBlockHeight } = await connectionRef.current!.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
      tx.add(
        await programRef.current.methods.startSession(spk).accounts({ wallet: publicKey, player: ppda }).instruction(),
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: spk, lamports: SESSION_FUND_LAMPORTS }),
      );
      const signed = await signTransaction(tx);
      const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
      await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      const expires = Date.now() + SESSION_DURATION_SLOTS * BLOCK_TIME_MS;
      storeSessionKey(nkp, expires);
      setSessionKeypair(nkp);
      setSessionExpiry(expires);
      setPlayerState(prev => prev ? { ...prev, sessionKey: spk, sessionExpiresAt: expires } : {
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expires, escrowBalance: 0,
      });
      refreshPlayerState();
    } catch (err: any) { setError(err.message || "Session start failed"); } finally { setIsLoading(false); }
  }, [publicKey, signTransaction, sweepSessionKey]);

  // Join game — creates player + starts session in one TX
  const joinGame = useCallback(async () => {
    if (!publicKey || !signTransaction || !programRef.current) { setError("Wallet not connected"); return; }
    await sweepSessionKey();
    setIsLoading(true); setError(null);
    try {
      const programId = getProgramId();
      const [ppda] = PublicKey.findProgramAddressSync([Buffer.from("player"), publicKey.toBuffer()], programId);
      const exists = !!(await connectionRef.current!.getAccountInfo(ppda));
      const nkp = nacl.sign.keyPair();
      const spk = new PublicKey(nkp.publicKey);
      const gm = getGoldMint();
      const ata = getGoldAta(publicKey, gm);
      const { blockhash, lastValidBlockHeight } = await connectionRef.current!.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
      if (!exists) {
        tx.add(await programRef.current.methods.joinGame().accounts({
          wallet: publicKey, player: ppda, goldMint: gm, playerTokenAccount: ata,
          tokenProgram: getToken2022ProgramId(),
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
        }).instruction());
      }
      tx.add(
        await programRef.current.methods.startSession(spk).accounts({ wallet: publicKey, player: ppda }).instruction(),
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: spk, lamports: SESSION_FUND_LAMPORTS }),
      );
      const signed = await signTransaction(tx);
      const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
      await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      const expires = Date.now() + SESSION_DURATION_SLOTS * BLOCK_TIME_MS;
      storeSessionKey(nkp, expires);
      setSessionKeypair(nkp);
      setSessionExpiry(expires);
      setPlayerState({
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expires, escrowBalance: 0,
      });
      refreshPlayerState();
    } catch (err: any) { setError(err.message || "Join failed"); } finally { setIsLoading(false); }
  }, [publicKey, signTransaction, sweepSessionKey]);

  const checkSession = useCallback(async () => {
    if (!publicKey) return false;
    const loaded = loadSessionKey();
    if (!loaded) return false;
    setSessionKeypair(loaded.keypair);
    setSessionExpiry(loaded.expiresAt);
    refreshPlayerState();
    return true;
  }, [publicKey, refreshPlayerState]);

  const clearSession = useCallback(() => { clearSessionKey(); setSessionKeypair(null); setSessionExpiry(null); setPlayerState(null); }, []);
  const getSessionPubkey = useCallback((): PublicKey | null => sessionKeypair ? getSessionPublicKey(sessionKeypair) : null, [sessionKeypair]);
  const isSessionValid = useCallback((): boolean => !!(sessionKeypair && sessionExpiry && Date.now() < sessionExpiry), [sessionKeypair, sessionExpiry]);

  return {
    sessionKeypair, sessionExpiry, sessionPubkey: getSessionPubkey(),
    isSessionValid, playerState, isLoading, error,
    startSession, joinGame, checkSession, refreshPlayerState, clearSession,
    fundSessionKey, sweepSessionKey, topUpSession, topUpStatus,
  };
}
