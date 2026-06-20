"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
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

  // Stale status timer cleanup
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearStatusTimer() {
    if (statusTimerRef.current) { clearTimeout(statusTimerRef.current); statusTimerRef.current = null; }
  }

  // Session balance cache — re-fetch every 5s so low-balance is caught quickly
  const sessionBalanceRef = useRef<{ lamports: number; time: number } | null>(null);
  const lastFundTimeRef = useRef(0);

  // Pending confirmed move — prevents stale background confirmation from reverting a newer move
  const moveSeqRef = useRef(0);

  // Pending mine TXs — cells we've sent mine TXs for but haven't confirmed yet
  const pendingMinesRef = useRef<Set<string>>(new Set());

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
    const pendingSet = pendingMinesRef.current;
    const spots: GoldSpot[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) {
          const mined = bits ? isCellMined(bits, x, y) : false;
          const pending = pendingSet.has(`${x},${y}`);
          spots.push({ x, y, hasGold: !mined || pending, pending });
        }
      }
    }
    setVisibleGold(spots);
  }, [fetchBitmap]);

  // Periodic gold refresh (every 5s, also on position change)
  const updateVisibleGold = useCallback(async () => {
    const bits = await fetchBitmap();
    const { minX, maxX, minY, maxY } = getViewportRange(position.x, position.y);
    const pendingSet = pendingMinesRef.current;
    const spots: GoldSpot[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) {
          const mined = bits ? isCellMined(bits, x, y) : false;
          const pending = pendingSet.has(`${x},${y}`);
          spots.push({ x, y, hasGold: !mined || pending, pending });
        }
      }
    }
    setVisibleGold(spots);
  }, [position, fetchBitmap]);

  useEffect(() => { updateVisibleGold(); }, [updateVisibleGold]);

  // Sync player position from on-chain state (throttled, used when TXs fail)
  const lastPosSyncRef = useRef(0);
  const syncPlayerPosition = useCallback(async () => {
    if (!connRef.current || !playerState?.wallet) return;
    const now = Date.now();
    if (now - lastPosSyncRef.current < 2000) return; // max once per 2s
    lastPosSyncRef.current = now;
    try {
      const [pda] = getPlayerPda(playerState.wallet, getProgramId());
      const info = await connRef.current.getAccountInfo(pda, "processed");
      if (info) {
        const chainX = info.data.readUInt32LE(72);
        const chainY = info.data.readUInt32LE(76);
        const cur = positionRef.current;
        if (chainX !== cur.x || chainY !== cur.y) {
          setPosition({ x: chainX, y: chainY });
        }
      }
    } catch {}
  }, [playerState]);

  // ── Other players fetch ──
  // Query all Player accounts via getProgramAccounts and filter to viewport.
  const PLAYER_DISC = Buffer.from([205, 222, 112, 7, 165, 155, 206, 218]);
  const fetchOtherPlayers = useCallback(async () => {
    if (!connRef.current) return;
    const myWallet = playerState?.wallet?.toString();
    const { minX, maxX, minY, maxY } = getViewportRange(positionRef.current.x, positionRef.current.y);
    try {
      const accounts = await connRef.current.getProgramAccounts(getProgramId(), {
        filters: [{ memcmp: { offset: 0, bytes: bs58.encode(PLAYER_DISC) } }],
      });
      const others: OtherPlayer[] = [];
      for (const { account } of accounts) {
        const d = account.data;
        const wallet = new PublicKey(d.slice(8, 40)).toString();
        if (wallet === myWallet) continue;
        const x = d.readUInt32LE(72);
        const y = d.readUInt32LE(76);
        // Only show if within viewport
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          others.push({ wallet, x, y });
        }
      }
      setVisiblePlayers(others);
    } catch (e) {
      // getProgramAccounts may fail on some RPCs — silently degrade
    }
  }, [playerState]);

  // Fetch other players every 2s
  useEffect(() => {
    fetchOtherPlayers();
    const iv = setInterval(fetchOtherPlayers, 2000);
    return () => clearInterval(iv);
  }, [fetchOtherPlayers]);

  // ── Blockhash pre-fetcher ──
  // Background interval fetches a fresh blockhash every 400ms
  // so the hot path rarely awaits getLatestBlockhash.
  const nextBlockhashRef = useRef<{ blockhash: string; lastValidBlockHeight: number }>(null!);
  const preFetchBlockhash = useCallback(async () => {
    try {
      const fresh = await connRef.current!.getLatestBlockhash();
      nextBlockhashRef.current = fresh;
    } catch {}
  }, []);
  // Kick off first fetch immediately, then every 400ms
  useEffect(() => {
    if (connRef.current) preFetchBlockhash();
    const iv = setInterval(preFetchBlockhash, 400);
    return () => clearInterval(iv);
  }, [preFetchBlockhash]);

  // ── Pending move batch confirm ──
  interface PendingMove {
    sig: string;
    seq: number;
    cellX: number;
    cellY: number;
    wasMineMove: boolean;
    txTime: number;
  }
  const pendingMovesRef = useRef<PendingMove[]>([]);

  // Periodic reconciliation: every 10s, check actual chain bitmap against pending set
  // Catches TXs that confirmed but were never detected by getSignatureStatuses
  const reconcilePending = useCallback(async () => {
    const pendingSet = pendingMinesRef.current;
    if (pendingSet.size === 0) return;
    const bits = await fetchBitmap(true);
    if (!bits) return;
    let changed = false;
    const keys = Array.from(pendingSet);
    for (const key of keys) {
      const [x, y] = key.split(",").map(Number);
      if (isCellMined(bits, x, y)) {
        pendingSet.delete(key);
        changed = true;
      }
    }
    if (changed) forceRefreshGold();
  }, [fetchBitmap, forceRefreshGold]);

  useEffect(() => {
    const iv = setInterval(reconcilePending, 10000);
    return () => clearInterval(iv);
  }, [reconcilePending]);

  // Batch check all pending sigs every 1s
  useEffect(() => {
    if (!connRef.current) return;
    const iv = setInterval(async () => {
      const q = pendingMovesRef.current;
      if (q.length === 0) return;
      const sigs = q.map(m => m.sig);
      try {
        const results = await connRef.current!.getSignatureStatuses(sigs);
        const stillValid: PendingMove[] = [];
        if (results?.value) {
          for (let i = 0; i < q.length; i++) {
            const pm = q[i];

            // TTL — drop TXs that haven't had any status update for 60s
            if (Date.now() - pm.txTime > 60000) {
              if (pm.wasMineMove) {
                pendingMinesRef.current.delete(`${pm.cellX},${pm.cellY}`);
                forceRefreshGold();
              }
              syncPlayerPosition();
              continue;
            }

            const status = results.value[i];
            if (!status) { stillValid.push(pm); continue; }

            // Still in processed state — keep tracking, don't resolve yet
            if (status.confirmationStatus === "processed") { stillValid.push(pm); continue; }

            // ── TX has a known outcome ──
            const txErrored = status.err !== null;
            if (pm.wasMineMove) {
              pendingMinesRef.current.delete(`${pm.cellX},${pm.cellY}`);
              // For errored TXs: force-refresh immediately so gold returns
              // For confirmed TXs: don't refresh — let 5s periodic or 10s reconciliation
              // pick up the chain state naturally, avoiding a stale-bitmap race
              if (txErrored) forceRefreshGold();
            }
            syncPlayerPosition();
            // Don't push to stillValid — resolved
          }
        }
        pendingMovesRef.current = stillValid;
      } catch {}
    }, 1000);
    return () => clearInterval(iv);
  }, [forceRefreshGold, syncPlayerPosition]);

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
    // Use pre-fetched blockhash if available (common case, zero RPC wait)
    let blockhash: string, lastValidBlockHeight: number;
    if (nextBlockhashRef.current) {
      blockhash = nextBlockhashRef.current.blockhash;
      lastValidBlockHeight = nextBlockhashRef.current.lastValidBlockHeight;
      nextBlockhashRef.current = null!;
    } else {
      // Pre-fetcher was consumed — fetch on demand (rare, bursts only)
      const fresh = await connRef.current!.getLatestBlockhash();
      blockhash = fresh.blockhash;
      lastValidBlockHeight = fresh.lastValidBlockHeight;
    }
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
  }, [sessionPubkey]);

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

      // Check session key balance (cached briefly to avoid RPC spam)
      const balCache = sessionBalanceRef.current;
      let bal = balCache && (now - balCache.time < 5000) ? balCache.lamports : null;
      if (bal === null) {
        bal = await connRef.current.getBalance(sessionPubkey);
        sessionBalanceRef.current = { lamports: bal, time: now };
      }
      if (bal < 500_000) {
        // Show clear status immediately so user knows what's happening
        setStatus("Session low on XNT — topping up...");
        if (now - lastFundTimeRef.current < 5000) {
          // Still waiting for previous fund attempt — don't silently revert, keep status visible
          setIsMoving(false);
          return;
        }
        lastFundTimeRef.current = now;
        const { blockhash: fbh, lastValidBlockHeight: flvb } = await connRef.current.getLatestBlockhash();
        try {
          await fundSessionKey(sessionPubkey, fbh, flvb);
          await new Promise(r => setTimeout(r, 500));
        } catch {
          setStatus("⚠️ Top up needed — approve wallet prompt to add XNT to session");
          statusTimerRef.current = setTimeout(() => setStatus(""), 5000);
          setIsMoving(false);
          return;
        }
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
      // Gray state: add to pending set instead of hiding gold immediately.
      // The cell stays visible as a ghost until the TX confirms.
      if (expectedNewMine) {
        pendingMinesRef.current.add(`${newX},${newY}`);
        setVisibleGold(prev => prev.map(g =>
          g.x === newX && g.y === newY ? { ...g, hasGold: true, pending: true } : g
        ));
      }
      statusTimerRef.current = setTimeout(() => setStatus(""), 3000);

      // ── Track this sig in the pending queue ──
      pendingMovesRef.current.push({
        sig,
        seq,
        cellX: newX,
        cellY: newY,
        wasMineMove: expectedNewMine,
        txTime: Date.now(),
      });

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

      if (err?.name === "TransactionExpiredBlockheightExceededError") {
        nextBlockhashRef.current = null!;
      }

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
  }, [sessionKeypair, sessionPubkey, playerState, lastMoveTime, fundSessionKey, startSession, fetchBitmap, buildMoveTx]);

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
