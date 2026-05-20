"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { Position, Direction, GoldSpot, PlayerState, OtherPlayer } from "@/types";
import {
  getProgramId,
  getGoldMint,
  getGoldAta,
  getToken2022ProgramId,
  getGoldBitmapPda,
  getGameConfigPda,
  getPlayerPda,
  RPC_URL,
  GRID_SIZE,
  BITMAP_BYTES,
  hasGoldAt,
  isCellMined,
  markCellMined,
  clearCellMined,
  getViewportRange,
  GOLD_PER_MINE,
} from "@/lib/constants";
import { GoldMinerIDL } from "@/lib/idl";

const MOVE_COOLDOWN_MS = 300;

// move_and_mine instruction discriminator
const MOVE_AND_MINE_DISC = Buffer.from([26, 202, 228, 63, 206, 4, 137, 63]);
const DIRECTION_VARIANT: Record<Direction, number> = {
  Up: 0, Down: 1, Left: 2, Right: 3,
};

interface UseGameProps {
  sessionKeypair: nacl.SignKeyPair | null;
  sessionPubkey: PublicKey | null;
  playerState: PlayerState | null;
  fundSessionKey: (pk: PublicKey, bh: string, lvb: number) => Promise<void>;
  startSession: () => Promise<void>;
}

interface UseGameReturn {
  position: Position;
  visibleGold: GoldSpot[];
  visiblePlayers: OtherPlayer[];
  showPlayers: boolean;
  toggleShowPlayers: () => void;
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
  goldMined: number;
  status: string;
  getBitmap: () => Uint8Array | null;
}

export function useGame(props?: UseGameProps): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, fundSessionKey, startSession } = props ?? {};
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [goldMined, setGoldMined] = useState(0);
  const [status, setStatus] = useState("");
  const [showPlayers, setShowPlayers] = useState(true);
  const [visiblePlayers, setVisiblePlayers] = useState<OtherPlayer[]>([]);
  const toggleShowPlayers = useCallback(() => setShowPlayers(p => !p), []);
  const connRef = useRef<Connection | null>(null);
  const gold_mint_pk = useRef<PublicKey | null>(null);
  const bitmapRef = useRef<Uint8Array | null>(null);
  const bitmapLastFetch = useRef(0);

  // Cached blockhash
  const cachedBlockhash = useRef<{ blockhash: string; lastValidBlockHeight: number } | null>(null);
  const blockhashTime = useRef(0);

  // Stale status timer cleanup
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearStatusTimer() {
    if (statusTimerRef.current) { clearTimeout(statusTimerRef.current); statusTimerRef.current = null; }
  }

  // Session balance cache — only re-fetch every 30s at most, or on insufficient-funds failure
  const sessionBalanceRef = useRef<{ lamports: number; time: number } | null>(null);
  const lastFundTimeRef = useRef(0);

  // Pending confirmed move — prevents stale background confirmation from reverting a newer move
  const moveSeqRef = useRef(0);

  // Single timeout-based background confirmation per player (replaces polling loop)
  const pendingConfirmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!connRef.current) connRef.current = new Connection(RPC_URL, "confirmed");
    // Fetch GOLD mint from game_config
    (async () => {
      if (gold_mint_pk.current) return;
      try {
        const [cfgPda] = getGameConfigPda();
        const info = await connRef.current!.getAccountInfo(cfgPda);
        if (info) gold_mint_pk.current = new PublicKey(info.data.slice(44, 76));
      } catch {}
    })();
  }, []);

  // Sync gold count from playerState
  useEffect(() => {
    if (playerState) setGoldMined(playerState.goldiumMinted);
  }, [playerState]);

  // Load position from chain on mount
  const initializedRef = useRef(false);
  useEffect(() => {
    if (playerState?.wallet && connRef.current && !initializedRef.current) {
      setPosition(playerState.position);
      const load = async () => {
        const [pda] = getPlayerPda(playerState.wallet!, getProgramId());
        const info = await connRef.current!.getAccountInfo(pda, "confirmed");
        if (info) {
          setPosition({ x: info.data.readUInt32LE(72), y: info.data.readUInt32LE(76) });
        }
        initializedRef.current = true;
      };
      load();
    }
  }, [playerState]);

  // Fetch the bitmap (cached, refetched every 30s)
  const fetchBitmap = useCallback(async (force = false) => {
    if (!connRef.current) return null;
    const now = Date.now();
    if (!force && bitmapRef.current && now - bitmapLastFetch.current < 30000) return bitmapRef.current;

    try {
      const [bpda] = getGoldBitmapPda();
      const info = await connRef.current.getAccountInfo(bpda, "confirmed");
      if (info && info.data.length >= BITMAP_BYTES) {
        // Raw bitmap — no Anchor discriminator (unchecked account, owner = program)
        bitmapRef.current = new Uint8Array(info.data.slice(0, BITMAP_BYTES));
        bitmapLastFetch.current = now;
        return bitmapRef.current;
      }
    } catch (e) {
      console.warn("Failed to fetch bitmap:", e);
    }
    return bitmapRef.current;
  }, []);

  // Force bitmap+gold refresh (call after mining so new data is reflected)
  const forceRefreshGold = useCallback(async () => {
    const bits = await fetchBitmap(true);
    const { minX, maxX, minY, maxY } = getViewportRange(positionRef.current.x, positionRef.current.y);
    const spots: GoldSpot[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) {
          const mined = bits ? isCellMined(bits, x, y) : false;
          spots.push({ x, y, hasGold: !mined });
        }
      }
    }
    setVisibleGold(spots);
  }, [fetchBitmap]);

  // Periodic gold refresh (every 5s, also on position change)
  const updateVisibleGold = useCallback(async () => {
    const bits = await fetchBitmap();
    const { minX, maxX, minY, maxY } = getViewportRange(position.x, position.y);
    const spots: GoldSpot[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) {
          const mined = bits ? isCellMined(bits, x, y) : false;
          spots.push({ x, y, hasGold: !mined });
        }
      }
    }
    setVisibleGold(spots);
  }, [position, fetchBitmap]);

  useEffect(() => { updateVisibleGold(); }, [updateVisibleGold]);
  // Extra periodic refresh so gold spots stay synced
  useEffect(() => {
    const interval = setInterval(() => fetchBitmap(), 5000);
    return () => clearInterval(interval);
  }, [fetchBitmap]);

  const getBlockhash = useCallback(async () => {
    const cached = cachedBlockhash.current;
    const age = Date.now() - blockhashTime.current;
    if (cached && age < 15000) return cached;
    const fresh = await connRef.current!.getLatestBlockhash();
    cachedBlockhash.current = fresh;
    blockhashTime.current = Date.now();
    return fresh;
  }, []);

  const invalidateBlockhash = useCallback(() => {
    cachedBlockhash.current = null;
    blockhashTime.current = 0;
  }, []);

  // Build move_and_mine TX manually (no IDL dependency for the hot path)
  const buildMoveTx = useCallback(async (
    direction: Direction,
    playerPda: PublicKey,
    gameConfigPda: PublicKey,
    goldBitmapPda: PublicKey,
    goldMintPk: PublicKey,
    goldAta: PublicKey,
    tokenProgram: PublicKey,
    ataProgram: PublicKey,
    systemProgram: PublicKey,
  ): Promise<Transaction> => {
    const { blockhash, lastValidBlockHeight } = await getBlockhash();
    const tx = new Transaction({ feePayer: sessionPubkey!, blockhash, lastValidBlockHeight });

    // Accounts:
    // 0 sessionSigner (signer)
    // 1 player (writable)
    // 2 gameConfig (writable)
    // 3 goldBitmap (writable)
    // 4 goldMint (writable)
    // 5 playerTokenAccount (writable)
    // 6 tokenProgram
    // 7 associatedTokenProgram
    // 8 systemProgram

    // Serialize direction as enum variant
    const dirByte = DIRECTION_VARIANT[direction];

    // Instruction data: 8-byte discriminator + 1-byte enum variant (Direction)
    const data = Buffer.alloc(9);
    MOVE_AND_MINE_DISC.copy(data, 0);
    data[8] = dirByte;

    const keys = [
      { pubkey: sessionPubkey!, isSigner: true, isWritable: false },
      { pubkey: playerPda, isSigner: false, isWritable: true },
      { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      { pubkey: goldBitmapPda, isSigner: false, isWritable: true },
      { pubkey: goldMintPk, isSigner: false, isWritable: true },
      { pubkey: goldAta, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: ataProgram, isSigner: false, isWritable: false },
      { pubkey: systemProgram, isSigner: false, isWritable: false },
    ];

    tx.add(new TransactionInstruction({
      programId: getProgramId(),
      keys,
      data,
    }));

    return tx;
  }, [sessionPubkey, getBlockhash]);

  const move = useCallback(async (direction: Direction) => {
    if (!sessionKeypair || !sessionPubkey || !playerState || !connRef.current) return;

    const now = Date.now();
    if (now - lastMoveTime < MOVE_COOLDOWN_MS) return;

    const curPos = positionRef.current;
    let newX = curPos.x, newY = curPos.y;
    switch (direction) {
      case Direction.Up:    newY = curPos.y + 1; break;
      case Direction.Down:  newY = curPos.y - 1; break;
      case Direction.Left:  newX = curPos.x - 1; break;
      case Direction.Right: newX = curPos.x + 1; break;
    }
    if (newX < 1 || newX > GRID_SIZE || newY < 1 || newY > GRID_SIZE) return;
    if (newX === curPos.x && newY === curPos.y) return;

    // Clear any stale status timer from previous move
    clearStatusTimer();

    // Bump sequence counter so older background confirmations are ignored
    const seq = ++moveSeqRef.current;

    setIsMoving(true);
    setLastMoveTime(now);
    setPosition({ x: newX, y: newY }); // optimistic
    setStatus("Moving...");

    // Pre-compute gold check from cached bitmap (fast, no RPC)
    const bitsBefore = bitmapRef.current;
    const goldFormula = hasGoldAt(newX, newY);
    const alreadyMined = bitsBefore ? isCellMined(bitsBefore, newX, newY) : false;
    const expectedNewMine = goldFormula && !alreadyMined;

    const programId = getProgramId();
    const walletPk = playerState.wallet;
    let playerPda: PublicKey | undefined;

    try {
      const signerKp = Keypair.fromSecretKey(sessionKeypair.secretKey);

      // Check session key balance (cached to avoid RPC spam)
      const balCache = sessionBalanceRef.current;
      let bal = balCache && (now - balCache.time < 30000) ? balCache.lamports : null;
      if (bal === null) {
        bal = await connRef.current.getBalance(sessionPubkey);
        sessionBalanceRef.current = { lamports: bal, time: now };
      }
      if (bal < 500_000) {
        if (now - lastFundTimeRef.current < 5000) {
          setIsMoving(false); setPosition(positionRef.current); setStatus(""); return;
        }
        lastFundTimeRef.current = now;
        const { blockhash: fbh, lastValidBlockHeight: flvb } = await getBlockhash();
        try { await fundSessionKey(sessionPubkey, fbh, flvb); await new Promise(r => setTimeout(r, 500)); }
        catch { setIsMoving(false); setPosition(positionRef.current); setStatus(""); return; }
        sessionBalanceRef.current = { lamports: 1_000_000, time: now };
      }

      if (!walletPk) return;

      const [playerPda] = getPlayerPda(walletPk, programId);
      const [gameConfigPda] = getGameConfigPda(programId);
      const [goldBitmapPda] = getGoldBitmapPda(programId);
      const tokenProgram = getToken2022ProgramId();
      const ataProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

      let goldMintPk = gold_mint_pk.current;
      if (!goldMintPk) {
        try {
          const cfgInfo = await connRef.current.getAccountInfo(gameConfigPda);
          if (cfgInfo) {
            goldMintPk = new PublicKey(cfgInfo.data.slice(44, 76));
            gold_mint_pk.current = goldMintPk;
          }
        } catch {}
      }
      if (!goldMintPk) {
        setIsMoving(false); setPosition(positionRef.current); setStatus("GOLD mint not found"); return;
      }

      const goldAta = getGoldAta(walletPk, goldMintPk);

      // Build and send move TX
      const tx = await buildMoveTx(
        direction, playerPda, gameConfigPda, goldBitmapPda,
        goldMintPk, goldAta, tokenProgram, ataProgram, SystemProgram.programId
      );

      tx.sign(signerKp);
      const serialized = tx.serialize();
      const sig = await connRef.current.sendRawTransaction(serialized);

      // sendRawTransaction succeeded ≡ leader accepted TX (X1's processed). Unblock immediately.
      setIsMoving(false);
      setStatus(expectedNewMine ? "Mined! +" + GOLD_PER_MINE + " GOLD" : "Moved");
      // Optimistic gold removal — hides the mined cell instantly, background confirm syncs later
      if (expectedNewMine) {
        setVisibleGold(prev => prev.map(g => g.x === newX && g.y === newY ? { ...g, hasGold: false } : g));
        // Flip the bitmap bit so updateVisibleGold re-computes correctly
        if (bitmapRef.current) markCellMined(bitmapRef.current, newX, newY);
      }
      statusTimerRef.current = setTimeout(() => setStatus(""), 3000);
      invalidateBlockhash();

      // ── Background: single-shot timeout (~1 blocktime), no polling loop ──
      // Keep track of whether we optimistically removed gold, for revert
      const wasMineMove = expectedNewMine;
      if (pendingConfirmRef.current) clearTimeout(pendingConfirmRef.current);
      pendingConfirmRef.current = setTimeout(async () => {
        try {
          const { value } = await connRef.current!.getSignatureStatus(sig, { searchTransactionHistory: false });
          if (!value || !value.confirmations) {
            // TX may have been orphaned. Revert if still the current move.
            if (moveSeqRef.current !== seq) return;
            // Restore optimistically removed gold
            if (wasMineMove) forceRefreshGold();
            invalidateBlockhash();
            const posInfo = await connRef.current!.getAccountInfo(playerPda, "confirmed");
            if (posInfo) setPosition({ x: posInfo.data.readUInt32LE(72), y: posInfo.data.readUInt32LE(76) });
            else setPosition(positionRef.current);
            return;
          }

          if (moveSeqRef.current !== seq) return;

          // Sync bitmap
          const freshBits = await connRef.current!.getAccountInfo(goldBitmapPda, "confirmed");
          if (freshBits && freshBits.data.length >= BITMAP_BYTES) {
            const realBits = new Uint8Array(freshBits.data.slice(0, BITMAP_BYTES));
            bitmapRef.current = realBits;
            bitmapLastFetch.current = Date.now();
            const cellMined = isCellMined(realBits, newX, newY);
            if (cellMined) {
              setVisibleGold(prev => prev.map(g => g.x === newX && g.y === newY ? { ...g, hasGold: false } : g));
            }
          }

          if (moveSeqRef.current !== seq) return;

          // Sync position
          const posInfo = await connRef.current!.getAccountInfo(playerPda, "confirmed");
          if (posInfo && moveSeqRef.current === seq) {
            setPosition({ x: posInfo.data.readUInt32LE(72), y: posInfo.data.readUInt32LE(76) });
          }
        } catch {
          if (moveSeqRef.current === seq) {
            if (wasMineMove) forceRefreshGold();
            invalidateBlockhash();
            const posInfo = await connRef.current!.getAccountInfo(playerPda, "confirmed");
            if (posInfo) setPosition({ x: posInfo.data.readUInt32LE(72), y: posInfo.data.readUInt32LE(76) });
            else setPosition(positionRef.current);
          }
        }
      }, 600);
      return;
    } catch (err: any) {
      const errMsg = err.message || String(err);

      if (errMsg.includes("SessionExpired") || errMsg.includes("0x1771")) {
        setStatus("Renewing session...");
        try {
          await startSession();
          await new Promise(r => setTimeout(r, 1500));
          setIsMoving(false);
          setLastMoveTime(0);
          move(direction);
          return;
        } catch {
          setStatus("Session expired. Reconnect.");
          setIsMoving(false);
          return;
        }
      }

      if (err?.name === "TransactionExpiredBlockheightExceededError") invalidateBlockhash();

      try {
        const [pda] = getPlayerPda(walletPk, programId);
        const info = await connRef.current.getAccountInfo(pda, "confirmed");
        if (info) setPosition({ x: info.data.readUInt32LE(72), y: info.data.readUInt32LE(76) });
        else setPosition(positionRef.current);
      } catch { setPosition(positionRef.current); }
      setStatus("");
    } finally {
      setIsMoving(false);
    }
  }, [sessionKeypair, sessionPubkey, playerState, lastMoveTime, fundSessionKey, startSession, getBlockhash, invalidateBlockhash, fetchBitmap, buildMoveTx]);

  // Keyboard controls
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const km: Record<string, Direction> = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up, s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left, d: Direction.Right, D: Direction.Right,
      };
      const dir = km[e.key];
      if (dir) { e.preventDefault(); moveRef.current(dir); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const canMove = Boolean(sessionKeypair && sessionPubkey && playerState && !isMoving);
  const getBitmap = useCallback(() => bitmapRef.current, []);

  return { position, visibleGold, visiblePlayers, showPlayers, toggleShowPlayers, isMoving, lastMoveTime, move, canMove, goldMined, status, getBitmap };
}
