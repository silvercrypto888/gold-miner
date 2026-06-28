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
  getTreasuryPda,
  getTreasuryGoldAta,
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

  // Immediate TX-in-flight guard (React state is too slow for rapid keypresses)
  const moveInProgressRef = useRef(false);

  // Pending confirmed move — prevents stale background confirmation from reverting a newer move
  const moveSeqRef = useRef(0);

  // Pending mine tracking removed — with the move cooldown, gold
  // immediately disappears optimistically and stays gone.

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

  // Pending mine tracking removed — with the move cooldown, gold
  // immediately disappears optimistically and stays gone.

  // Batch check all pending sigs every 1s
  // Policy:
  //  - Not found yet -> keep tracking
  //  - Processed -> keep tracking
  //  - Finalized/confirmed for mine TXs -> keep tracking until bitmap confirms
  //  - Errored -> remove from pending immediately, force refresh
  //  - TTL 120s -> drop from queue, let reconciliation handle it
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

            // Keep mine TX sigs in queue longer (120s) so reconciliation has time
            // to confirm via bitmap before we lose the tracking reference.
            const ttl = pm.wasMineMove ? 120000 : 60000;
            if (Date.now() - pm.txTime > ttl) {
              syncPlayerPosition();
              continue;
            }

            const status = results.value[i];
            if (!status) { stillValid.push(pm); continue; }

            // Still in processed state — keep tracking
            if (status.confirmationStatus === "processed") { stillValid.push(pm); continue; }

            if (status.err) {
              // Errored: revert immediately — forceRefreshGold to resync
              if (pm.wasMineMove) forceRefreshGold();
              syncPlayerPosition();
            } else if (pm.wasMineMove) {
              // Successfully finalized mine
              stillValid.push(pm);
            }
            // Successfully finalized walk TX: don't sync position — we set
            // it optimistically when the key was pressed. Syncing from chain
            // would race against rapid movement (TX #1 commits at position
            // before TX #2, snapping the player backward).
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
    treasuryPda: PublicKey,
    treasuryGoldAta: PublicKey,
    tokenProgram: PublicKey,
    ataProgram: PublicKey,
    systemProgram: PublicKey,
    memo?: string,
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
    // 6 treasury (writable)
    // 7 treasuryTokenAccount (writable)
    // 8 tokenProgram
    // 9 associatedTokenProgram
    // 10 systemProgram

    // Serialize direction as enum variant
    const dirByte = DIRECTION_VARIANT[direction];

    // Instruction data: 8-byte discriminator + 1-byte enum variant (Direction)
    // + 8-byte move sequence (to make every TX unique — prevents duplicate
    // signatures from rapid keypresses reusing the same blockhash).
    const data = Buffer.alloc(17);
    MOVE_AND_MINE_DISC.copy(data, 0);
    data[8] = dirByte;
    if (memo) {
      const seq = parseInt(memo.split("_")[0] || "0", 10);
      data.writeBigUInt64LE(BigInt(seq), 9);
    }

    const keys = [
      { pubkey: sessionPubkey!, isSigner: true, isWritable: false },
      { pubkey: playerPda, isSigner: false, isWritable: true },
      { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      { pubkey: goldBitmapPda, isSigner: false, isWritable: true },
      { pubkey: goldMintPk, isSigner: false, isWritable: true },
      { pubkey: goldAta, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: treasuryGoldAta, isSigner: false, isWritable: true },
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
    // Immediate ref check — prevents duplicate TXs from rapid keypresses
    if (moveInProgressRef.current) {
      console.log("move() RETURNING EARLY — TX already in flight");
      return;
    }
    moveInProgressRef.current = true;

    console.log("move() called:", direction, "sessionKeypair:", !!sessionKeypair, "sessionPubkey:", !!sessionPubkey, "playerState:", !!playerState, "conn:", !!connRef.current);
    if (!sessionKeypair || !sessionPubkey || !playerState || !connRef.current) {
      console.log("move() RETURNING EARLY — missing dependency");
      moveInProgressRef.current = false;
      return;
    }

    const now = Date.now();
    if (now - lastMoveTime < MOVE_COOLDOWN_MS) {
      console.log("move() RETURNING EARLY — cooldown");
      moveInProgressRef.current = false;
      return;
    }

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

      // Check session key balance (cached briefly to avoid RPC spam).
      // After sweep, the key may hold ~3.4M lamports (rentExempt + 2.5M).
      // The move_and_mine program creates the player's Token-2022 ATA via CPI
      // when it doesn't exist yet — that costs ~2.04M in rent, paid by the
      // session key. The key must retain its own rent-exempt balance afterward.
      // Minimum safe = rentExempt (~890K) + ATA rent (~2.04M) + buffer = 3.5M.
      const SESSION_MIN_SAFE_BALANCE = 3_500_000;
      const balCache = sessionBalanceRef.current;
      let bal = balCache && (now - balCache.time < 5000) ? balCache.lamports : null;
      if (bal === null) {
        bal = await connRef.current.getBalance(sessionPubkey);
        sessionBalanceRef.current = { lamports: bal, time: now };
      }
      if (bal < SESSION_MIN_SAFE_BALANCE) {
        setStatus("Topping up gas funds");
        if (now - lastFundTimeRef.current < 5000) {
          setIsMoving(false);
          moveInProgressRef.current = false;
          return;
        }
        lastFundTimeRef.current = now;
        const { blockhash: fbh, lastValidBlockHeight: flvb } = await connRef.current.getLatestBlockhash();
        try {
          await fundSessionKey(sessionPubkey, fbh, flvb);
          // Wait briefly for RPC propagation, then re-check actual balance
          await new Promise(r => setTimeout(r, 1000));
          const newBal = await connRef.current.getBalance(sessionPubkey);
          sessionBalanceRef.current = { lamports: newBal, time: Date.now() };
          if (newBal < SESSION_MIN_SAFE_BALANCE) {
            setStatus("Gas funds too low");
            statusTimerRef.current = setTimeout(() => setStatus(""), 5000);
            setIsMoving(false);
            moveInProgressRef.current = false;
            return;
          }
        } catch {
          setStatus("Topping up gas funds");
          statusTimerRef.current = setTimeout(() => setStatus(""), 5000);
          setIsMoving(false);
          moveInProgressRef.current = false;
          return;
        }
      }

      if (!walletPk) {
        moveInProgressRef.current = false;
        return;
      }

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
      // Derive treasury PDAs
      const [treasuryPda] = getTreasuryPda(programId);
      const treasuryGoldAta = getTreasuryGoldAta(treasuryPda, goldMintPk);

      console.log("Building move TX with:", {
        direction, playerPda: playerPda.toBase58(), gameConfigPda: gameConfigPda.toBase58(),
        goldBitmapPda: goldBitmapPda.toBase58(), goldMintPk: goldMintPk.toBase58(),
        goldAta: goldAta.toBase58(), treasuryPda: treasuryPda.toBase58(),
        treasuryGoldAta: treasuryGoldAta.toBase58()
      });
      // ── Build TX ──
      // Build and send move TX. Append a memo so even with the same blockhash
      // and same position, every TX has a unique signature (prevents "already
      // processed" on rapid keypresses). The memo costs negligible CU.
      const tx = await buildMoveTx(
        direction, playerPda, gameConfigPda, goldBitmapPda,
        goldMintPk, goldAta, treasuryPda, treasuryGoldAta,
        tokenProgram, ataProgram, SystemProgram.programId,
        Date.now().toString() + Math.random().toString(36).slice(2, 8),
      );

      tx.sign(signerKp);
      const serialized = tx.serialize();
      console.log("TX serialized, length:", serialized.length, "sending...");
      const sig = await connRef.current.sendRawTransaction(serialized);
      console.log("TX sent! Sig:", sig);

      // ── Post-send cooldown ──
      // Keep moveInProgressRef true for ~600ms so rapid keypresses can't reuse
      // the same blockhash (identical TX = duplicate signature = rejected).
      // The blockhash advances every ~400ms, so 600ms guarantees uniqueness.
      setTimeout(() => { moveInProgressRef.current = false; }, 600);

      setIsMoving(false);
      setStatus(expectedNewMine ? "Mined! +" + GOLD_PER_MINE + " GOLD" : "Moved");
      // Gold is immediately hidden on mine — no pending/gray state.
      // The 600ms cooldown between moves prevents race conditions.
      if (expectedNewMine) {
        setVisibleGold(prev => prev.filter(g => !(g.x === newX && g.y === newY)));
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
      moveInProgressRef.current = false;
      console.error("MOVE_AND_MINE_ERROR:", err);
      console.error("Error details:", err.message || String(err), err.stack || "");
      const errMsg = err.message || String(err);

      // Show error in UI status so user sees it even if console is closed
      setStatus("Error (see console)");
      statusTimerRef.current = setTimeout(() => setStatus(""), 8000);

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
        const [pda] = getPlayerPda(walletPk!, programId);
        const info = await connRef.current.getAccountInfo(pda, "confirmed");
        if (info) setPosition({ x: info.data.readUInt32LE(72), y: info.data.readUInt32LE(76) });
        else setPosition(positionRef.current);
      } catch { setPosition(positionRef.current); }
      // DON'T clear status here — let the error message show
    } finally {
      setIsMoving(false);
      // Success path clears ref via setTimeout (600ms cooldown).
      // Error/catch paths clear it immediately so user can retry.
    }
  }, [sessionKeypair, sessionPubkey, playerState, lastMoveTime, fundSessionKey, startSession, fetchBitmap, buildMoveTx]);

  // Keyboard controls — hold-to-repeat with 600ms post-move cooldown
  const moveRef = useRef(move);
  moveRef.current = move;
  const heldDirRef = useRef<Direction | null>(null);
  const autoMoveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const km: Record<string, Direction> = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up, s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left, d: Direction.Right, D: Direction.Right,
      };
      const dir = km[e.key];
      if (!dir) return;
      e.preventDefault();
      // On first press (or key changed), fire immediately and start polling
      if (heldDirRef.current !== dir) {
        heldDirRef.current = dir;
        moveRef.current(dir); // immediate first step
        if (autoMoveTimerRef.current) clearInterval(autoMoveTimerRef.current);
        // Poll every 100ms — fires as soon as the 600ms cooldown finishes
        autoMoveTimerRef.current = setInterval(() => {
          if (!moveInProgressRef.current && heldDirRef.current) {
            moveRef.current(heldDirRef.current);
          }
        }, 100);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      const km: Record<string, Direction> = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up, s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left, d: Direction.Right, D: Direction.Right,
      };
      if (km[e.key] === heldDirRef.current) {
        heldDirRef.current = null;
        if (autoMoveTimerRef.current) {
          clearInterval(autoMoveTimerRef.current);
          autoMoveTimerRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      if (autoMoveTimerRef.current) clearInterval(autoMoveTimerRef.current);
    };
  }, []);

  const canMove = Boolean(sessionKeypair && sessionPubkey && playerState && !isMoving);
  const getBitmap = useCallback(() => bitmapRef.current, []);

  return { position, visibleGold, visiblePlayers, showPlayers, toggleShowPlayers, isMoving, lastMoveTime, move, canMove, goldMined, status, getBitmap };
}
