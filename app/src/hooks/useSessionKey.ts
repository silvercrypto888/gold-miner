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
  getGameConfigPda,
  getToken2022ProgramId,
  RPC_URL,
  SESSION_DURATION_SLOTS,
} from "@/lib/constants";
import { PlayerState } from "@/types";

const SESSION_FUND_LAMPORTS = 0.2 * LAMPORTS_PER_SOL;
const SESSION_MAX_LAMPORTS = 0.5 * LAMPORTS_PER_SOL;
const SWEEP_DUST_THRESHOLD = 0.01 * LAMPORTS_PER_SOL;

// Module-level shared promise so all useSessionKey instances await the same load
let _sessionPromise: Promise<{ keypair: nacl.SignKeyPair; expirySlot: number } | null> | null = null;
let _promiseForWallet: PublicKey | null = null;

export function useSessionKey() {
  const { publicKey, signTransaction, signMessage } = useWallet();
  const [sessionKeypair, setSessionKeypair] = useState<nacl.SignKeyPair | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);
  const playerStateRef = useRef<PlayerState | null>(playerState);
  playerStateRef.current = playerState;
  const signMessageRef = useRef(signMessage);
  signMessageRef.current = signMessage;
  const loadingRef = useRef(false);

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

  // Poll current slot every 5s for session validity checks
  useEffect(() => {
    if (!connectionRef.current) return;
    const poll = async () => {
      try {
        const slot = await connectionRef.current!.getSlot();
        setCurrentSlot(slot);
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  // Load existing session — requires wallet signMessage to decrypt
  const prevPubkeyRef = useRef<PublicKey | null>(null);
  useEffect(() => {
    if (!publicKey) {
      prevPubkeyRef.current = null;
      _sessionPromise = null;
      _promiseForWallet = null;
      return;
    }
    // Skip only if we've already kicked off a promise for this exact wallet.
    // On first render signMessage may be null, so _sessionPromise won't exist yet;
    // when signMessage arrives on the next render we must try again.
    if (prevPubkeyRef.current?.equals(publicKey) && _sessionPromise) return;

    const sign = signMessageRef.current;
    if (!sign) return; // wait for signMessage to be ready; don't mark pubkey as tried

    // Start a new shared promise if none exists or wallet changed
    if (!_sessionPromise || !_promiseForWallet?.equals(publicKey)) {
      _sessionPromise = loadSessionKey(sign);
      _promiseForWallet = publicKey;
    }

    _sessionPromise.then(loaded => {
      if (loaded) {
        setSessionKeypair(loaded.keypair);
        setSessionExpiry(loaded.expirySlot);
      } else if (prevPubkeyRef.current === null) {
        setSessionKeypair(null);
        setSessionExpiry(null);
      }
      prevPubkeyRef.current = publicKey;
    }).catch(() => {
      setSessionKeypair(null);
      setSessionExpiry(null);
      prevPubkeyRef.current = publicKey;
    });
  }, [publicKey]);

  // Refresh on wallet connect
  useEffect(() => {
    if (!publicKey) { setPlayerState(null); return; }
    const timer = setTimeout(() => refreshPlayerState(), 200);
    return () => clearTimeout(timer);
  }, [publicKey]);

  // ── Listen for cross-component session save events ──
  // When another component (e.g. GameCanvas calling startSession) stores a new
  // session key, this tells ALL useSessionKey instances to reload it.
  useEffect(() => {
    const handler = async (e: Event) => {
      const sign = signMessageRef.current;
      if (!sign) return;
      try {
        const loaded = await loadSessionKey(sign);
        if (loaded) {
          setSessionKeypair(loaded.keypair);
          setSessionExpiry(loaded.expirySlot);
        }
      } catch { /* ignore: user may cancel sign prompt */ }
    };
    window.addEventListener("sessionkey-changed", handler);
    return () => window.removeEventListener("sessionkey-changed", handler);
  }, []);

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
        };
        setPlayerState(p);
        setSessionExpiry(p.sessionExpiresAt); // Sync from chain as source of truth
      } else {
        setPlayerState(null);
      }
    } catch { /* player may not exist yet */ }
  }, [publicKey]);

  // Sync local sessionExpiry from chain truth whenever playerState refreshes
  useEffect(() => {
    if (playerState?.sessionExpiresAt) {
      setSessionExpiry(playerState.sessionExpiresAt);
    }
  }, [playerState?.sessionExpiresAt]);

  // Listen for sessionkey-changed events from localStorage changes.
  useEffect(() => {
    const handler = async (e: Event) => {
      // Reset shared promise so next mount/reload fetches fresh data
      _sessionPromise = null;
      _promiseForWallet = null;

      // Skip if event came from storeSessionKey — caller already has keypair in memory
      const detail = (e as CustomEvent).detail;
      if (detail?.fromStore) return;

      if (!signMessageRef.current) return;
      try {
        const loaded = await loadSessionKey(signMessageRef.current);
        if (loaded) {
          setSessionKeypair(loaded.keypair);
          setSessionExpiry(loaded.expirySlot);
          refreshPlayerState();
        } else {
          setSessionKeypair(null);
          setSessionExpiry(null);
        }
      } catch {
        setSessionKeypair(null);
        setSessionExpiry(null);
      }
    };
    window.addEventListener("sessionkey-changed", handler);
    return () => window.removeEventListener("sessionkey-changed", handler);
  }, [refreshPlayerState]);

  // Fund the session key to SESSION_FUND_LAMPORTS (internal — requires blockhash)
  const fundSessionKey = useCallback(async (
    sessionPubkey: PublicKey, blockhash: string, lastValidBlockHeight: number
  ) => {
    if (!publicKey || !signTransaction) return;
    const balance = await connectionRef.current!.getBalance(sessionPubkey);
    // Hard cap: never allow balance to exceed SESSION_MAX_LAMPORTS
    if (balance >= SESSION_FUND_LAMPORTS || balance >= SESSION_MAX_LAMPORTS) return;
    const target = Math.min(SESSION_FUND_LAMPORTS, SESSION_MAX_LAMPORTS);
    const amount = target - balance;
    if (amount <= 0) return;
    // Notify immediately before prompting — full requested amount, not variable remainder
    window.dispatchEvent(new CustomEvent("gas-deposit", {
      detail: { amountLamports: SESSION_FUND_LAMPORTS },
    }));
    const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
    tx.add(SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: sessionPubkey,
      lamports: amount,
    }));
    const signed = await signTransaction(tx);
    const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
    await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  }, [publicKey, signTransaction]);

  // Top up session key to SESSION_FUND_LAMPORTS — user-facing, gets its own blockhash
  const [topUpStatus, setTopUpStatus] = useState<string | null>(null);
  const toppingUpRef = useRef(false);
  const topUpSession = useCallback(async (): Promise<boolean> => {
    if (toppingUpRef.current) return false;
    if (!publicKey || !connectionRef.current || !signMessageRef.current) { setTopUpStatus("Wallet not connected"); return false; }
    const loaded = await loadSessionKey(signMessageRef.current);
    if (!loaded) { setTopUpStatus("No session key"); return false; }
    const spk = new PublicKey(loaded.keypair.publicKey);
    try {
      toppingUpRef.current = true;
      setTopUpStatus("Topping up gas funds");
      const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
      await fundSessionKey(spk, blockhash, lastValidBlockHeight);
      setTopUpStatus("Topped up ✓");
      setTimeout(() => setTopUpStatus(null), 3000);
      return true;
    } catch (err: any) {
      setTopUpStatus(err?.message?.includes("User rejected") ? "Cancelled" : "Error (see console)");
      setTimeout(() => setTopUpStatus(null), 3000);
      return false;
    } finally {
      toppingUpRef.current = false;
    }
  }, [publicKey, fundSessionKey]);

  // Sweep remaining XNT from session key back to user wallet.
  // Leave behind rentExempt + 2.5M so the session key can still afford
  // the Token-2022 ATA creation rent (~2.04M) in move_and_mine CPI plus
  // its own rent-exempt balance. Matches SESSION_MIN_SAFE_BALANCE in
  // useGame (3.5M total including rentExempt).
  const sweepSessionKey = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !connectionRef.current || !signMessageRef.current) return false;
    const loaded = await loadSessionKey(signMessageRef.current);
    if (!loaded) return false;
    const naclKp = loaded.keypair;
    const sk = new PublicKey(naclKp.publicKey);
    try {
      const balance = await connectionRef.current.getBalance(sk);
      if (balance <= SWEEP_DUST_THRESHOLD) return false;
      const kp = Keypair.fromSecretKey(naclKp.secretKey);
      const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
      const rentExempt = await connectionRef.current.getMinimumBalanceForRentExemption(0);
      const LEAVE_BEHIND = rentExempt + 2_500_000; // matches SESSION_MIN_SAFE_BALANCE
      const amount = balance - LEAVE_BEHIND;
      if (amount <= 0) return false;
      const tx = new Transaction({ feePayer: sk, blockhash, lastValidBlockHeight });
      tx.add(SystemProgram.transfer({ fromPubkey: sk, toPubkey: publicKey, lamports: amount }));
      tx.sign(kp);
      const sig = await connectionRef.current.sendRawTransaction(tx.serialize());
      await connectionRef.current.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return true;
    } catch { return false; }
  }, [publicKey, signMessage]);

  // Start a new session (used for renewal too)
  // STEP 1: Generate and save session key locally BEFORE spending XNT.
  // If the signMessage prompt is cancelled, user hasn't paid yet.
  const startSession = useCallback(async () => {
    if (joiningRef.current) return;
    if (!publicKey || !signTransaction || !signMessageRef.current || !programRef.current) { setError("Wallet not connected"); return; }
    joiningRef.current = true;
    await sweepSessionKey();
    setIsLoading(true); setError(null);

    // Generate the session keypair first
    const nkp = nacl.sign.keyPair();
    const spk = new PublicKey(nkp.publicKey);
    let expirySlot: number;

    try {
      // STEP 1: Encrypt and save the session key locally FIRST.
      // This requires the user to sign a message. If they cancel here,
      // no XNT has been spent yet.
      const currentSlot = await connectionRef.current!.getSlot();
      expirySlot = currentSlot + SESSION_DURATION_SLOTS;
      await storeSessionKey(nkp, expirySlot, signMessageRef.current);
    } catch (err: any) {
      setIsLoading(false);
      joiningRef.current = false;
      // Distinguish user rejection from real errors
      if (err?.message?.toLowerCase().includes("user rejected") || err?.message?.toLowerCase().includes("cancel")) {
        setError("Session save cancelled. Your XNT was not spent. Please click Start Session again.");
      } else {
        setError("Failed to encrypt session key: " + (err.message || "Unknown error") + ". Your XNT was not spent.");
      }
      return;
    }

    // STEP 2: Now that the key is safely saved, send the on-chain TX.
    try {
      const [ppda] = PublicKey.findProgramAddressSync([Buffer.from("player"), publicKey.toBuffer()], getProgramId());
      const { blockhash, lastValidBlockHeight } = await connectionRef.current!.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
      tx.add(
        await programRef.current.methods.startSession(spk).accounts({ wallet: publicKey, player: ppda }).instruction(),
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: spk, lamports: SESSION_FUND_LAMPORTS }),
      );
      // Notify immediately before prompting wallet
      window.dispatchEvent(new CustomEvent("gas-deposit", {
        detail: { amountLamports: SESSION_FUND_LAMPORTS, isRenewal: true },
      }));
      const signed = await signTransaction(tx);
      const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
      await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });

      // STEP 3: Success — update local state
      setSessionKeypair(nkp);
      setSessionExpiry(expirySlot);
      setPlayerState(prev => prev ? { ...prev, sessionKey: spk, sessionExpiresAt: expirySlot } : {
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expirySlot,
      });
      refreshPlayerState();
    } catch (err: any) {
      // On-chain TX failed but we already saved the key.
      // The user can retry — the key is already in localStorage.
      setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your session key is saved locally — try again.");
    } finally {
      setIsLoading(false);
      joiningRef.current = false;
    }
  }, [publicKey, signTransaction, sweepSessionKey]);

  // Guard against double-join/double-start while a session creation TX is in flight
  const joiningRef = useRef(false);

  // Join game — creates player + starts session in one TX
  // STEP 1: Generate and save session key locally BEFORE spending XNT.
  const joinGame = useCallback(async () => {
    if (joiningRef.current) return;
    if (!publicKey || !signTransaction || !signMessageRef.current || !programRef.current) { setError("Wallet not connected"); return; }
    joiningRef.current = true;
    await sweepSessionKey();
    setIsLoading(true); setError(null);

    // Generate the session keypair first
    const nkp = nacl.sign.keyPair();
    const spk = new PublicKey(nkp.publicKey);
    let expirySlot: number;

    try {
      // STEP 1: Encrypt and save the session key locally FIRST.
      const currentSlot = await connectionRef.current!.getSlot();
      expirySlot = currentSlot + SESSION_DURATION_SLOTS;
      await storeSessionKey(nkp, expirySlot, signMessageRef.current);
    } catch (err: any) {
      setIsLoading(false);
      joiningRef.current = false;
      if (err?.message?.toLowerCase().includes("user rejected") || err?.message?.toLowerCase().includes("cancel")) {
        setError("Session save cancelled. Your XNT was not spent. Please click Start Session again.");
      } else {
        setError("Failed to encrypt session key: " + (err.message || "Unknown error") + ". Your XNT was not spent.");
      }
      return;
    }

    // STEP 2: Now that the key is saved, send on-chain TX.
    try {
      const programId = getProgramId();
      const [ppda] = PublicKey.findProgramAddressSync([Buffer.from("player"), publicKey.toBuffer()], programId);
      const exists = !!(await connectionRef.current!.getAccountInfo(ppda));
      const gm = getGoldMint();
      const ata = getGoldAta(publicKey, gm);
      const { blockhash, lastValidBlockHeight } = await connectionRef.current!.getLatestBlockhash();
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
      if (!exists) {
        tx.add(await programRef.current.methods.joinGame().accounts({
          wallet: publicKey, player: ppda, gameConfig: getGameConfigPda()[0], goldMint: gm, playerTokenAccount: ata,
          tokenProgram: getToken2022ProgramId(),
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
        }).instruction());
      }
      tx.add(
        await programRef.current.methods.startSession(spk).accounts({ wallet: publicKey, player: ppda }).instruction(),
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: spk, lamports: SESSION_FUND_LAMPORTS }),
      );
      // Notify immediately before prompting wallet
      window.dispatchEvent(new CustomEvent("gas-deposit", {
        detail: { amountLamports: SESSION_FUND_LAMPORTS, isRenewal: false },
      }));
      const signed = await signTransaction(tx);
      const sig = await connectionRef.current!.sendRawTransaction(signed.serialize());
      await connectionRef.current!.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });

      // STEP 3: Success
      setSessionKeypair(nkp);
      setSessionExpiry(expirySlot);
      setPlayerState({
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expirySlot,
      });
      refreshPlayerState();
    } catch (err: any) {
      setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your session key is saved locally — try again.");
    } finally {
      setIsLoading(false);
      joiningRef.current = false;
    }
  }, [publicKey, signTransaction, sweepSessionKey]);

  const checkSession = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessageRef.current) return false;
    try {
      const loaded = await loadSessionKey(signMessageRef.current);
      if (!loaded) return false;
      setSessionKeypair(loaded.keypair);
      setSessionExpiry(loaded.expirySlot);
      refreshPlayerState();
      return true;
    } catch { return false; }
  }, [publicKey, refreshPlayerState]);

  const clearSession = useCallback(() => { clearSessionKey(); setSessionKeypair(null); setSessionExpiry(null); setPlayerState(null); }, []);
  const getSessionPubkey = useCallback((): PublicKey | null => sessionKeypair ? getSessionPublicKey(sessionKeypair) : null, [sessionKeypair]);
  const isSessionValid = useCallback((): boolean => {
    if (!sessionKeypair) return false;
    // If we haven't loaded playerState yet, be optimistic — don't flash expired
    // while chain data is still fetching. Once playerState loads, use chain truth.
    if (!playerState) return true;
    const chainExpiry = playerState.sessionExpiresAt;
    if (!chainExpiry) return false;
    // If we haven't polled a slot yet, be optimistic
    if (currentSlot === 0) return true;
    return currentSlot < chainExpiry;
  }, [sessionKeypair, currentSlot, playerState]);

  return {
    sessionKeypair, sessionExpiry, sessionPubkey: getSessionPubkey(),
    isSessionValid, playerState, isLoading, error,
    startSession, joinGame, checkSession, refreshPlayerState, clearSession,
    fundSessionKey, sweepSessionKey, topUpSession, topUpStatus,
  };
}
