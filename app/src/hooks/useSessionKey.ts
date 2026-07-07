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
  hasStoredSessionKey,
  getSessionPublicKey,
  backupSessionKey,
  restoreSessionKey,
  clearBackupSessionKey,
  getRenewedAt,
  setRenewedAt,
  clearRenewedAt,
} from "@/lib/utils";
import { clearCachedCryptoKey } from "@/lib/sessionCrypto";
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

// ── Sweep result types (used by sweepSessionKey + callers) ──
type SweepOk = { ok: true };
type SweepErr = { ok: false; reason: string; detail?: string };

const SESSION_FUND_LAMPORTS = 0.2 * LAMPORTS_PER_SOL;
const SESSION_MAX_LAMPORTS = 0.5 * LAMPORTS_PER_SOL;
const SWEEP_DUST_THRESHOLD = 0.01 * LAMPORTS_PER_SOL;

// Global shared promise so all useSessionKey instances (even across chunks) await the same load.
// Next.js code-splits this file, so module-level variables get duplicated.
const G_PROMISE = "__gm_sessionPromise__";
const G_WALLET = "__gm_promiseWallet__";
function getSessionPromise(): Promise<{ keypair: nacl.SignKeyPair; expirySlot: number } | null> | null {
  return (typeof globalThis !== "undefined" ? (globalThis as any)[G_PROMISE] : null) || null;
}
function setSessionPromise(p: Promise<{ keypair: nacl.SignKeyPair; expirySlot: number } | null> | null): void {
  if (typeof globalThis !== "undefined") (globalThis as any)[G_PROMISE] = p;
}
function getPromiseWallet(): PublicKey | null {
  return (typeof globalThis !== "undefined" ? (globalThis as any)[G_WALLET] : null) || null;
}
function setPromiseWallet(pk: PublicKey | null): void {
  if (typeof globalThis !== "undefined") (globalThis as any)[G_WALLET] = pk;
}

export function useSessionKey() {
  const { publicKey, signTransaction, signMessage } = useWallet();
  const [sessionKeypair, setSessionKeypair] = useState<nacl.SignKeyPair | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  // Grace period after optimistic session renewal — ignore stale RPC data + mismatch guard
  const renewedAtRef = useRef<number>(getRenewedAt());
  // Mutable ref for the current expected expiry — used by refreshPlayerState to defend
  // against stale RPC closures. Unlike sessionExpiry state, this updates immediately.
  const expectedExpiryRef = useRef<number | null>(null);
  // Suppress key-mismatch guard while creating a new session (local write before
  // chain confirms). Without this the guard sees the old chain key vs new local key
  // and immediately wipes the new key.
  const creatingSessionRef = useRef<boolean>(false);
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
  const signReadyRef = useRef(false);
  useEffect(() => {
    if (!publicKey) {
      prevPubkeyRef.current = null;
      setSessionPromise(null);
      setPromiseWallet(null);
      signReadyRef.current = false;
      return;
    }

    const sign = signMessageRef.current;
    const justBecameReady = sign && !signReadyRef.current;
    if (justBecameReady) {
      signReadyRef.current = true;
      // signMessage transitioned null→available: invalidate any promise
      // that was created while sign was missing so we can retry with the
      // real signer.
      if (!prevPubkeyRef.current?.equals(publicKey)) {
        setSessionPromise(null);
      }
    }

    if (!sign) return; // wallet adapter still booting — wait

    // Skip only if we've successfully loaded for this exact wallet.
    // NOTE: we intentionally retry (don't skip) when the shared promise was
    // rejected/failed so a transient decryption error doesn't permanently
    // lock the user out until page reload.
    const sessionPromise = getSessionPromise();
    const promiseWallet = getPromiseWallet();
    const promiseReady = sessionPromise && promiseWallet?.equals(publicKey);
    const alreadyLoaded = prevPubkeyRef.current?.equals(publicKey);
    if (alreadyLoaded && promiseReady) return;

    // Start a new shared promise if none exists, wallet changed, or prior failed
    if (!promiseReady) {
      const p = loadSessionKey(sign);
      setSessionPromise(p);
      setPromiseWallet(publicKey);
    }

    const sp = getSessionPromise()!;
    sp.then(loaded => {
      if (loaded) {
        setSessionKeypair(loaded.keypair);
        setSessionExpiry(loaded.expirySlot);
        expectedExpiryRef.current = loaded.expirySlot; // persist across refreshes
        prevPubkeyRef.current = publicKey;
      }
      // If loaded is null, localStorage simply has no key. Don't overwrite
      // a valid in-memory session, and don't mark prevPubkey so the effect
      // can retry on next render if the user later saves a session.
    }).catch(() => {
      // Decryption/signing failed — DON'T mark pubkey as done so we retry.
      // Also DON'T clear an existing valid session from React state.
      console.warn("Session key load failed — will retry");
    });
  }, [publicKey]);

  // Refresh on wallet connect
  useEffect(() => {
    if (!publicKey) {
      setPlayerState(null);
      clearCachedCryptoKey(); // wallet disconnected — wipe cached AES key
      return;
    }
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
        // Defensive: don't let stale RPC data clobber a fresh optimistic renewal.
        // Compare against the mutable ref (updated synchronously on renewal) rather
        // than the sessionExpiry state (which may be stale in a setTimeout closure).
        const expected = expectedExpiryRef.current;
        if (expected && p.sessionExpiresAt < expected) {
          // RPC returned older data — ignore it, chain will catch up on next poll.
          return;
        }
        setPlayerState(p);
        setSessionExpiry(p.sessionExpiresAt); // Sync from chain as source of truth
        expectedExpiryRef.current = p.sessionExpiresAt;
      } else {
        setPlayerState(null);
      }
    } catch { /* player may not exist yet */ }
  }, [publicKey]);

  // Sync local sessionExpiry from chain truth whenever playerState refreshes —
  // BUT only if chain data is fresher or equal. After a refresh, RPC may lag
  // behind our optimistic renewal; we must NOT let stale chain data overwrite
  // the newer localStorage expiry.
  useEffect(() => {
    if (playerState?.sessionExpiresAt) {
      const chain = playerState.sessionExpiresAt;
      const local = sessionExpiry || 0;
      if (chain >= local) {
        setSessionExpiry(chain);
        expectedExpiryRef.current = chain;
      }
    }
  }, [playerState?.sessionExpiresAt]);

  // ── Key-mismatch guard: if chain says a different session key than localStorage,
  // try to restore from backup, else wipe localStorage so the user starts fresh.
  // Guarded by: (a) a grace period after renewal, and (b) a stale-RPC check —
  // if chain expiry is OLDER than our local expiry, the RPC node is lagging
  // and we must NOT nuke the fresh key.
  useEffect(() => {
    if (!playerState?.sessionKey || !sessionKeypair) return;
    // If we're currently creating a session, local key won't match chain yet — skip guard
    if (creatingSessionRef.current) {
      console.log("[key-mismatch guard] session creation in progress, skipping");
      return;
    }
    const localPk = new PublicKey(sessionKeypair.publicKey);
    if (playerState.sessionKey.equals(localPk)) {
      console.log("[key-mismatch guard] keys match, no action");
      return;
    }
    // Skip during grace period after an optimistic renewal — RPC may still lag
    if (Date.now() - renewedAtRef.current < 15000) {
      console.log("[key-mismatch guard] in grace period, skipping");
      return;
    }
    // Stale-RPC defence: if chain expiry < local expiry, RPC hasn't caught up
    // to our renewal yet.  Don't wipe the new key.
    const localExpiry = sessionExpiry || 0;
    const chainExpiry = playerState.sessionExpiresAt || 0;
    console.log("[key-mismatch guard] chainExpiry:", chainExpiry, "localExpiry:", localExpiry);
    if (chainExpiry < localExpiry) {
      console.log("[key-mismatch guard] RPC lagging, skipping");
      return;
    }
    // Mismatch detected: loaded key doesn't match on-chain session key
    console.warn("[key-mismatch guard] MISMATCH DETECTED! chain key != local key");
    const restored = restoreSessionKey();
    if (restored) {
      // Backup was restored to localStorage; reload it into state
      if (!signMessageRef.current) return;
      loadSessionKey(signMessageRef.current).then(loaded => {
        if (loaded) {
          setSessionKeypair(loaded.keypair);
          setSessionExpiry(loaded.expirySlot);
          setError("Session key restored from backup (chain mismatch detected).");
        }
      });
    } else {
      // No backup — localStorage key is orphaned
      console.warn("[key-mismatch guard] No backup found — calling clearSessionKey!");
      clearSessionKey();
      setSessionKeypair(null);
      setSessionExpiry(null);
      setError("Session key mismatch detected (localStorage key doesn't match chain). Starting fresh...");
    }
  }, [playerState?.sessionKey?.toBase58(), sessionKeypair, sessionExpiry]);

  // Listen for sessionkey-changed events from localStorage changes.
  useEffect(() => {
    const handler = async (e: Event) => {
      // Reset shared promise so next mount/reload fetches fresh data
      setSessionPromise(null);
      setPromiseWallet(null);

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
  //
  // Returns { ok: true } on success, { ok: false, reason: "..." } on failure.
  // "no_key" / "no_funds" = harmless skip conditions.
  // "user_rejected" / "rpc_error" / "sweep_failed" = real errors the caller should abort on.
  const sweepSessionKey = useCallback(async (): Promise<SweepOk | SweepErr> => {
    if (!publicKey || !connectionRef.current || !signMessageRef.current) {
      return { ok: false, reason: "no_wallet" };
    }
    // Skip if nothing is stored locally
    if (!hasStoredSessionKey()) return { ok: false, reason: "no_key" };

    let loaded: { keypair: nacl.SignKeyPair; expirySlot: number } | null = null;
    try {
      loaded = await loadSessionKey(signMessageRef.current);
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("user rejected") || msg.includes("cancel")) {
        return { ok: false, reason: "user_rejected", detail: "User cancelled the wallet prompt to decrypt the old session key" };
      }
      return { ok: false, reason: "decrypt_failed", detail: err?.message || "Unknown error" };
    }
    if (!loaded) return { ok: false, reason: "no_key" };

    const naclKp = loaded.keypair;
    const sk = new PublicKey(naclKp.publicKey);
    try {
      const balance = await connectionRef.current.getBalance(sk);
      if (balance <= SWEEP_DUST_THRESHOLD) return { ok: false, reason: "no_funds" };
      const kp = Keypair.fromSecretKey(naclKp.secretKey);
      const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
      const rentExempt = await connectionRef.current.getMinimumBalanceForRentExemption(0);
      const LEAVE_BEHIND = rentExempt + 2_500_000; // matches SESSION_MIN_SAFE_BALANCE
      const amount = balance - LEAVE_BEHIND;
      if (amount <= 0) return { ok: false, reason: "no_funds" };
      const tx = new Transaction({ feePayer: sk, blockhash, lastValidBlockHeight });
      tx.add(SystemProgram.transfer({ fromPubkey: sk, toPubkey: publicKey, lamports: amount }));
      tx.sign(kp);
      const sig = await connectionRef.current.sendRawTransaction(tx.serialize());
      await connectionRef.current.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return { ok: true };
    } catch (err: any) {
      console.error("Sweep failed:", err);
      return { ok: false, reason: "sweep_failed", detail: err?.message || "Unknown error" };
    }
  }, [publicKey, signMessage]);

  // Start a new session (used for renewal too)
  // STEP 1: Sweep old session key first. If sweep fails for a real reason
  // (user rejected, RPC error), abort before overwriting localStorage.
  // STEP 2: Backup old session key before overwriting.
  // STEP 3: Save new key locally.
  // STEP 4: Send on-chain TX.
  // STEP 5: On chain failure, restore old key from backup so user can retry.
  const startSession = useCallback(async () => {
    if (joiningRef.current) return;
    if (!publicKey || !signTransaction || !signMessageRef.current || !programRef.current) { setError("Wallet not connected"); return; }
    joiningRef.current = true;
    // Suppress key-mismatch guard while creating — local key will differ from chain until TX confirms
    creatingSessionRef.current = true;

    try {

    // ── STEP 1: Sweep old session key ──
    console.log("[startSession] Step 1: sweep old key");
    const sweepResult = await sweepSessionKey();
    console.log("[startSession] sweep result:", sweepResult);
    if (!sweepResult.ok) {
      // Harmless skips (no key, no funds) — continue normally.
      // Real errors — abort before touching localStorage.
      if (sweepResult.ok === false && (sweepResult.reason === "user_rejected" || sweepResult.reason === "decrypt_failed" || sweepResult.reason === "sweep_failed")) {
        joiningRef.current = false;
        setError("Session renewal paused: " + (sweepResult.detail || sweepResult.reason) + ". Please fix the issue and try again.");
        return;
      }
      // else: no_key, no_funds, no_wallet — keep going
    }

    setIsLoading(true); setError(null);

    // Generate the session keypair first
    console.log("[startSession] generating new keypair");
    const nkp = nacl.sign.keyPair();
    const spk = new PublicKey(nkp.publicKey);
    let expirySlot: number;

    // ── STEP 2: Backup old key before overwriting ──
    backupSessionKey();

    try {
      // ── STEP 3: Encrypt and save the new session key locally FIRST ──
      console.log("[startSession] Step 3: storeSessionKey");
      const currentSlot = await connectionRef.current!.getSlot();
      expirySlot = currentSlot + SESSION_DURATION_SLOTS;
      await storeSessionKey(nkp, expirySlot, signMessageRef.current);
      console.log("[startSession] storeSessionKey completed");
    } catch (err: any) {
      console.error("[startSession] storeSessionKey FAILED:", err);
      setIsLoading(false);
      joiningRef.current = false;
      // Restore old key since we haven't spent anything yet
      restoreSessionKey();
      // Distinguish user rejection from real errors
      if (err?.message?.toLowerCase().includes("user rejected") || err?.message?.toLowerCase().includes("cancel")) {
        setError("Session save cancelled. Your XNT was not spent. Please click Start Session again.");
      } else {
        setError("Failed to encrypt session key: " + (err.message || "Unknown error") + ". Your XNT was not spent.");
      }
      return;
    } finally {
      // Always clear creation flag — regardless of success or failure, the local write is done
      creatingSessionRef.current = false;
    }

    // ── STEP 4: Now that the key is safely saved, send the on-chain TX ──
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

      // ── STEP 5: Success — clean up backup and update local state ──
      clearBackupSessionKey();
      const now = Date.now();
      renewedAtRef.current = now;
      setRenewedAt(now);
      setSessionKeypair(nkp);
      setSessionExpiry(expirySlot);
      expectedExpiryRef.current = expirySlot; // sync ref for stale-RPC defense
      setPlayerState(prev => prev ? { ...prev, sessionKey: spk, sessionExpiresAt: expirySlot } : {
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expirySlot,
      });
      // Delay chain refresh — RPC nodes lag behind, don't clobber our optimistic update
      setTimeout(() => refreshPlayerState(), 3000);
    } catch (err: any) {
      // On-chain TX failed but we already saved the new key (and lost the old one).
      // Restore the old key from backup so the user isn't stranded.
      const restored = restoreSessionKey();
      if (restored) {
        setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your previous session key has been restored — try again or clear session to start fresh.");
      } else {
        // No backup existed (first session?) — still leave the new key saved
        setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your session key is saved locally — try again.");
      }
    } finally {
      setIsLoading(false);
      joiningRef.current = false;
    }
  }, [publicKey, signTransaction, sweepSessionKey]);

  // Guard against double-join/double-start while a session creation TX is in flight
  const joiningRef = useRef(false);

  // Join game — creates player + starts session in one TX
  // STEP 1: Sweep old session key first. If sweep fails for a real reason, abort.
  // STEP 2: Backup old key, then save new key locally before on-chain TX.
  // STEP 3: Send on-chain TX.
  // STEP 4: On failure, restore backup.
  const joinGame = useCallback(async () => {
    if (joiningRef.current) return;
    if (!publicKey || !signTransaction || !signMessageRef.current || !programRef.current) { setError("Wallet not connected"); return; }
    joiningRef.current = true;

    // ── STEP 1: Sweep old session key ──
    const sweepResult = await sweepSessionKey();
    if (!sweepResult.ok) {
      if (sweepResult.ok === false && (sweepResult.reason === "user_rejected" || sweepResult.reason === "decrypt_failed" || sweepResult.reason === "sweep_failed")) {
        joiningRef.current = false;
        setError("Join paused: " + (sweepResult.detail || sweepResult.reason) + ". Please fix the issue and try again.");
        return;
      }
      // no_key, no_funds, no_wallet — keep going
    }

    setIsLoading(true); setError(null);

    // Generate the session keypair first
    const nkp = nacl.sign.keyPair();
    const spk = new PublicKey(nkp.publicKey);
    let expirySlot: number;

    // ── STEP 2: Backup old key, then save new key locally FIRST ──
    backupSessionKey();

    try {
      const currentSlot = await connectionRef.current!.getSlot();
      expirySlot = currentSlot + SESSION_DURATION_SLOTS;
      await storeSessionKey(nkp, expirySlot, signMessageRef.current);
    } catch (err: any) {
      setIsLoading(false);
      joiningRef.current = false;
      restoreSessionKey();
      if (err?.message?.toLowerCase().includes("user rejected") || err?.message?.toLowerCase().includes("cancel")) {
        setError("Session save cancelled. Your XNT was not spent. Please click Start Session again.");
      } else {
        setError("Failed to encrypt session key: " + (err.message || "Unknown error") + ". Your XNT was not spent.");
      }
      return;
    }

    // ── STEP 3: Send on-chain TX ──
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

      // ── STEP 4: Success — clean up backup and update local state ──
      clearBackupSessionKey();
      const now = Date.now();
      renewedAtRef.current = now; // start grace period for RPC lag
      setRenewedAt(now);
      setSessionKeypair(nkp);
      setSessionExpiry(expirySlot);
      expectedExpiryRef.current = expirySlot; // sync ref for stale-RPC defense
      setPlayerState({
        wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 }, goldiumMinted: 0, sessionExpiresAt: expirySlot,
      });
      // Delay chain refresh — RPC nodes lag behind, don't clobber our optimistic update
      setTimeout(() => refreshPlayerState(), 3000);
    } catch (err: any) {
      const restored = restoreSessionKey();
      if (restored) {
        setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your previous session key has been restored — try again or clear session to start fresh.");
      } else {
        setError("On-chain transaction failed: " + (err.message || "Unknown error") + ". Your session key is saved locally — try again.");
      }
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

  const clearSession = useCallback(() => { clearBackupSessionKey(); clearRenewedAt(); clearSessionKey(); setSessionKeypair(null); setSessionExpiry(null); setPlayerState(null); expectedExpiryRef.current = null; }, []);
  const getSessionPubkey = useCallback((): PublicKey | null => sessionKeypair ? getSessionPublicKey(sessionKeypair) : null, [sessionKeypair]);
  const isSessionValid = useCallback((): boolean => {
    if (!sessionKeypair) return false;
    // Use the freshest expiry we know about — localStorage is updated
    // optimistically at the same moment the on-chain TX is signed, so
    // it can be ahead of lagging RPC nodes.  Fall back to chain data.
    const localExpiry = sessionExpiry || 0;
    const chainExpiry = playerState?.sessionExpiresAt || 0;
    const expiry = Math.max(localExpiry, chainExpiry);
    if (!expiry) return false;
    // Grace margin for RPC lag (~5 min / 300 slots)
    const margin = 300;
    if (currentSlot === 0) return false; // haven't polled yet — don't guess
    return currentSlot < (expiry + margin);
  }, [sessionKeypair, currentSlot, playerState, sessionExpiry]);

  return {
    sessionKeypair, sessionExpiry, sessionPubkey: getSessionPubkey(),
    isSessionValid, playerState, isLoading, error,
    startSession, joinGame, checkSession, refreshPlayerState, clearSession,
    fundSessionKey, sweepSessionKey, topUpSession, topUpStatus,
  };
}
