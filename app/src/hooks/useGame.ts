"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useSessionKey } from "./useSessionKey";
import { Position, Direction, GoldSpot, OtherPlayer } from "@/types";
import {
  getProgramId,
  RPC_URL,
  GRID_SIZE,
  hasGoldAt,
  getViewportRange,
  getPlayerPda,
  getGameConfigPda,
  getGoldSpotPda,
  getPlayerGoldiumAta,
  GOLD_PER_MINE,
  getToken2022ProgramId,
  getAtaProgramId,
} from "@/lib/constants";

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
}

const MOVE_COOLDOWN_MS = 400;

// Instruction discriminators
const MOVE_PLAYER_DISC = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);
const MINE_GOLD_DISC = Buffer.from([49, 40, 243, 122, 219, 94, 234, 9]);

// Direction enum variant index
const DIRECTION_VARIANT: Record<Direction, number> = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
};

export function useGame(): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, fundSessionKey } =
    useSessionKey();
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [goldMined, setGoldMined] = useState(0);
  const [visiblePlayers, setVisiblePlayers] = useState<OtherPlayer[]>([]);
  const [showPlayers, setShowPlayers] = useState(false);
  const [status, setStatus] = useState("");
  const connectionRef = useRef<Connection | null>(null);
  const goldiumMintRef = useRef<PublicKey | null>(null);
  // Timestamp of last authoritative on-chain position read.
  // Prevents stale playerState updates from overwriting position.
  const lastChainPositionRef = useRef<number>(0);
  // Cache balance check to avoid redundant getBalance calls
  const lastFundCheckRef = useRef<number>(0);

  // Pre-cached blockhash — refreshed every 30s in the background so
  // move/mine don't have to wait for getLatestBlockhash.
  const cachedBlockhashRef = useRef<{ blockhash: string; lastValidBlockHeight: number } | null>(null);
  const blockhashFetchRef = useRef<boolean>(false);

  const toggleShowPlayers = useCallback(() => {
    setShowPlayers(prev => !prev);
  }, []);

  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
  }, []);

  // Pre-cache blockhash every 30s so moves/mines don't wait for getLatestBlockhash
  useEffect(() => {
    const refresh = async () => {
      if (!connectionRef.current || blockhashFetchRef.current) return;
      blockhashFetchRef.current = true;
      try {
        const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
        cachedBlockhashRef.current = { blockhash, lastValidBlockHeight };
        blockhashTimeRef.current = Date.now();
      } catch (e) {
        console.warn("Failed to pre-cache blockhash:", e);
      } finally {
        blockhashFetchRef.current = false;
      }
    };
    refresh(); // initial fetch
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Get a blockhash — uses cached if fresh (<30s old), otherwise fetches from RPC
  const blockhashTimeRef = useRef<number>(0);
  const getBlockhash = useCallback(async (): Promise<{ blockhash: string; lastValidBlockHeight: number }> => {
    if (!connectionRef.current) throw new Error("No connection");
    const cached = cachedBlockhashRef.current;
    const cacheAge = Date.now() - blockhashTimeRef.current;
    if (cached && cacheAge < 30_000) return cached;
    // Cache miss or stale — fetch fresh
    const fresh = await connectionRef.current.getLatestBlockhash();
    cachedBlockhashRef.current = fresh;
    blockhashTimeRef.current = Date.now();
    return fresh;
  }, []);

  // Invalidate blockhash cache — must be called after every TX use
  // since each blockhash can only sign one transaction
  const invalidateBlockhash = useCallback(() => {
    cachedBlockhashRef.current = null;
    blockhashTimeRef.current = 0;
  }, []);

  // Fetch goldium mint address once
  useEffect(() => {
    if (goldiumMintRef.current) return;
    (async () => {
      try {
        const conn = connectionRef.current!;
        const [gameConfigPda] = getGameConfigPda();
        const configInfo = await conn.getAccountInfo(gameConfigPda);
        if (configInfo) {
          goldiumMintRef.current = new PublicKey(configInfo.data.slice(44, 76));
        }
      } catch (e) {
        console.error("Failed to fetch goldium mint:", e);
      }
    })();
  }, []);

  // Fetch other players visible in the viewport when showPlayers is toggled on
  // Player account size: 8 (disc) + 32 (wallet) + 32 (session_key) + 4 (pos_x) + 4 (pos_y) + 8 (goldium) + 8 (session_expires) + 1 (bump) = 97
  const PLAYER_ACCOUNT_SIZE = 97;
  const PLAYER_DISC = Buffer.from([205, 222, 112, 7, 165, 155, 206, 218]); // Anchor discriminator for "account:Player"

  useEffect(() => {
    if (!showPlayers || !connectionRef.current || !playerState?.wallet) {
      if (!showPlayers) setVisiblePlayers([]);
      return;
    }

    let cancelled = false;
    const fetchPlayers = async () => {
      try {
        const conn = connectionRef.current!;
        const programId = getProgramId();
        const myWallet = playerState.wallet!.toBase58();

        // Fetch all player accounts owned by the program
        const accounts = await conn.getProgramAccounts(programId, {
          filters: [
            { dataSize: PLAYER_ACCOUNT_SIZE },
          ],
          commitment: 'confirmed',
        });

        if (cancelled) return;

        const players: OtherPlayer[] = [];
        for (const acct of accounts) {
          const data = acct.account.data;
          // Verify discriminator
          if (!data.subarray(0, 8).equals(PLAYER_DISC)) continue;

          const wallet = new PublicKey(data.subarray(8, 40)).toBase58();
          // Skip self
          if (wallet === myWallet) continue;

          const x = data.readUInt32LE(72);
          const y = data.readUInt32LE(76);

          players.push({ wallet, x, y });
        }

        setVisiblePlayers(players);
      } catch (e) {
        console.warn("Failed to fetch other players:", e);
      }
    };

    fetchPlayers();
    // Refresh every 10 seconds while toggled on
    const interval = setInterval(fetchPlayers, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [showPlayers, playerState?.wallet]);
  // Sync gold count from playerState, but NOT position.
  // Position is only set from optimistic updates and direct on-chain reads
  // to prevent stale Anchor/fetch data from rubber-banding the player.
  useEffect(() => {
    if (playerState) {
      setGoldMined(playerState.goldiumMinted);
    }
  }, [playerState]);

  // Load initial position once when playerState first becomes available
  const initializedRef = useRef(false);
  useEffect(() => {
    if (playerState && !initializedRef.current) {
      setPosition(playerState.position);
      initializedRef.current = true;
    }
  }, [playerState]);

  const updateVisibleGold = useCallback(async () => {
    const { minX, maxX, minY, maxY } = getViewportRange(position.x, position.y);
    const programId = getProgramId();
    const goldSpots: GoldSpot[] = [];

    // Collect all positions that have gold by worldgen
    const candidatePositions: [number, number][] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) candidatePositions.push([x, y]);
      }
    }

    // Check on-chain which gold spots have been mined
    if (candidatePositions.length > 0 && connectionRef.current) {
      try {
        const pdas = candidatePositions.map(([x, y]) => {
          const xBuf = Buffer.alloc(4);
          xBuf.writeUInt32BE(x, 0);
          const yBuf = Buffer.alloc(4);
          yBuf.writeUInt32BE(y, 0);
          return PublicKey.findProgramAddressSync(
            [Buffer.from("gold_spot"), xBuf, yBuf],
            programId
          )[0];
        });

        // Batch fetch all gold_spot accounts
        const accounts = await connectionRef.current.getMultipleAccountsInfo(pdas, 'confirmed');

        // GoldSpot discriminator
        const goldSpotDisc = Buffer.from([112, 156, 149, 108, 70, 90, 135, 242]);

        for (let i = 0; i < candidatePositions.length; i++) {
          const [x, y] = candidatePositions[i];
          const acct = accounts[i];

          if (acct && acct.data.slice(0, 8).equals(goldSpotDisc)) {
            // Account exists — check if gold is still there
            const hasGold = acct.data[8] === 1;
            goldSpots.push({ x, y, hasGold });
          } else {
            // Account doesn't exist yet — gold is available
            goldSpots.push({ x, y, hasGold: true });
          }
        }
      } catch (e) {
        // Fallback: if batch fetch fails, assume all gold is available
        console.warn("Failed to fetch gold spots, assuming all available:", e);
        for (const [x, y] of candidatePositions) {
          goldSpots.push({ x, y, hasGold: true });
        }
      }
    }

    setVisibleGold(goldSpots);
  }, [position]);

  useEffect(() => { updateVisibleGold(); }, [updateVisibleGold]);

  // Mine gold at current position.
  // Always fetches position fresh from chain for PDA derivation
  // to avoid ConstraintSeeds errors from stale RPC data.
  const mineGold = useCallback(async (): Promise<boolean> => {
    if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current || !goldiumMintRef.current) {
      return false;
    }

    try {
      setStatus("Mining...");
      const programId = getProgramId();
      const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);
      const walletPk = playerState.wallet;
      if (!walletPk) return false;

      // Ensure session key has enough XNT for gas
      const balance = await connectionRef.current.getBalance(sessionSigner.publicKey);
      if (balance < 5_000_000) {
        const fundBh = await getBlockhash();
        try {
          await fundSessionKey(sessionSigner.publicKey, fundBh.blockhash, fundBh.lastValidBlockHeight);
        } catch (e) {
          console.warn("Failed to fund session key for mine:", e);
        }
      }

      const [playerPda] = getPlayerPda(walletPk, programId);

      // Pre-compute gold_spot PDA for the likely position (optimistic)
      // We'll verify against chain position below
      const likelyX = position.x;
      const likelyY = position.y;
      const [goldSpotPda] = getGoldSpotPda(likelyX, likelyY, programId);

      // Batch-fetch player account + gold_spot account in one RPC call
      const [playerInfo, goldSpotInfo] = await connectionRef.current.getMultipleAccountsInfo(
        [playerPda, goldSpotPda], 'confirmed'
      );
      if (!playerInfo) return false;

      const onChainX = playerInfo.data.readUInt32LE(72);
      const onChainY = playerInfo.data.readUInt32LE(76);
      // Only update position if chain read differs significantly from our tracked state
      // This prevents rubber-banding from stale RPC data while still correcting genuine drift
      const currentPos = { x: position.x, y: position.y };
      if (Math.abs(onChainX - currentPos.x) > 1 || Math.abs(onChainY - currentPos.y) > 1) {
        // Chain position is way off — something unusual happened, trust the chain
        setPosition({ x: onChainX, y: onChainY });
      }

      if (!hasGoldAt(onChainX, onChainY)) return false;

      // If chain position differs from our guess, re-derive PDA and re-fetch gold_spot
      let finalGoldSpotInfo = goldSpotInfo;
      let finalGoldSpotPda = goldSpotPda;
      if (onChainX !== likelyX || onChainY !== likelyY) {
        [finalGoldSpotPda] = getGoldSpotPda(onChainX, onChainY, programId);
        finalGoldSpotInfo = await connectionRef.current.getAccountInfo(finalGoldSpotPda, 'confirmed');
      }

      if (finalGoldSpotInfo) {
        const hasGold = finalGoldSpotInfo.data[8] === 1;
        if (!hasGold) {
          console.log(`Gold at (${onChainX}, ${onChainY}) already mined, skipping`);
          return false;
        }
      }
      const goldiumMint = goldiumMintRef.current;
      const [gameConfigPda] = getGameConfigPda(programId);
      const playerAta = getPlayerGoldiumAta(goldiumMint, playerPda);
      const tokenProgram = getToken2022ProgramId();
      const ataProgram = getAtaProgramId();

      // Create ATA idempotently — no-op if already exists
      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        sessionSigner.publicKey,  // payer
        playerAta,                // ata
        playerPda,                 // owner
        goldiumMint,               // mint
        tokenProgram,               // token program (Token-2022)
        ataProgram                   // ATA program
      );

      // Build mineGold instruction — Anchor CPI creates gold_spot if needed
      const mineIx = new TransactionInstruction({
        keys: [
          { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: true },       // session_signer (mut, payer)
          { pubkey: gameConfigPda, isSigner: false, isWritable: true },                 // game_config
          { pubkey: playerPda, isSigner: false, isWritable: true },                    // player
          { pubkey: finalGoldSpotPda, isSigner: false, isWritable: true },             // gold_spot (init_if_needed)
          { pubkey: goldiumMint, isSigner: false, isWritable: true },                    // goldium_mint
          { pubkey: playerAta, isSigner: false, isWritable: true },                      // player_token_account (associated_token init_if_needed)
          { pubkey: tokenProgram, isSigner: false, isWritable: false },                  // token_program
          { pubkey: ataProgram, isSigner: false, isWritable: false },                   // associated_token_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // system_program
        ],
        programId,
        data: MINE_GOLD_DISC,
      });

      const { blockhash, lastValidBlockHeight } = await getBlockhash();

      const tx = new Transaction({
        feePayer: sessionSigner.publicKey,
        blockhash,
        lastValidBlockHeight,
      });
      tx.add(createAtaIx);
      tx.add(mineIx);
      tx.sign(sessionSigner);

      const signature = await connectionRef.current.sendRawTransaction(
        tx.serialize(),
        { skipPreflight: false, preflightCommitment: "confirmed" }
      );
      invalidateBlockhash(); // blockhash consumed by this TX

      const mineResult = await connectionRef.current.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (mineResult.value?.err) {
        // Error 6005 = AlreadyMined — gold was mined by someone else, not a real failure
        const errStr = JSON.stringify(mineResult.value.err);
        if (errStr.includes("6005") || errStr.includes("AlreadyMined")) {
          console.log("Gold already mined by another player, refreshing");
          updateVisibleGold();
          setStatus("");
          return false;
        }
        console.error("Mine TX failed on-chain:", mineResult.value.err);
        setStatus("");
        return false;
      }

      console.log("Gold mined! TX:", signature);
      setGoldMined(prev => prev + GOLD_PER_MINE);
      setStatus("Mined");
      lastChainPositionRef.current = Date.now();

      // Fire-and-forget gold visibility refresh — don't block on it
      updateVisibleGold();
      return true;
    } catch (err: any) {
      const errMsg = String(err?.message || "");
      const errLogs = err?.logs ? err.logs.join(" ") : "";

      // "This transaction has already been processed" means the TX went through
      if (errMsg.includes("already been processed")) {
        setGoldMined(prev => prev + GOLD_PER_MINE);
        setStatus("Mined");
        updateVisibleGold();
        return true;
      }

      // AlreadyMined (6005 / 0x1775) — gold was mined by someone else, not a real failure
      if (errMsg.includes("6005") || errMsg.includes("0x1775") || errMsg.includes("AlreadyMined") || errLogs.includes("AlreadyMined")) {
        console.log("Gold already mined by another player, refreshing");
        updateVisibleGold();
        setStatus("");
        return false;
      }

      console.error("Mine gold failed:", err);
      setStatus("");
      // Invalidate cached blockhash on expiry so next action fetches fresh
      if (err?.name === "TransactionExpiredBlockheightExceededError" ||
          errMsg.includes("block height exceeded")) {
        invalidateBlockhash();
      }
      if (err?.logs) console.error("Program logs:", err.logs.join("\n"));
      return false;
    }
  }, [sessionKeypair, sessionPubkey, playerState, position, updateVisibleGold, getBlockhash, invalidateBlockhash, fundSessionKey]);

  // Move player — session key is fee payer
  const move = useCallback(
    async (direction: Direction) => {
      if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current) return;

      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) return;

      let newX = position.x, newY = position.y;
      switch (direction) {
        case Direction.Up:    newY = Math.min(GRID_SIZE, position.y + 1); break;
        case Direction.Down:  newY = Math.max(1, position.y - 1); break;
        case Direction.Left:  newX = Math.max(1, position.x - 1); break;
        case Direction.Right: newX = Math.min(GRID_SIZE, position.x + 1); break;
      }
      if (newX === position.x && newY === position.y) return;

      setIsMoving(true);
      setLastMoveTime(now);
      setPosition({ x: newX, y: newY }); // Optimistic
      setStatus("Moving...");

      try {
        const programId = getProgramId();
        const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);

        // Only check balance every 30s to cut an RPC call
        const fundCheckAge = Date.now() - lastFundCheckRef.current;
        if (fundCheckAge > 30_000) {
          const balance = await connectionRef.current.getBalance(sessionSigner.publicKey);
          lastFundCheckRef.current = Date.now();
          if (balance < 5_000_000) {
            const { blockhash: fundBh, lastValidBlockHeight: fundLvb } =
              await getBlockhash();
            try { await fundSessionKey(sessionSigner.publicKey, fundBh, fundLvb); }
            catch (e) { console.warn("Failed to fund session key:", e); }
          }
        }

        const walletPk = playerState.wallet;
        if (!walletPk) { setPosition(playerState.position); return; }
        const [playerPda] = getPlayerPda(walletPk, programId);

        const data = Buffer.concat([MOVE_PLAYER_DISC, Buffer.from([DIRECTION_VARIANT[direction]])]);
        const ix = new TransactionInstruction({
          keys: [
            { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: false },
            { pubkey: playerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId,
          data,
        });

        const { blockhash, lastValidBlockHeight } = await getBlockhash();
        const tx = new Transaction({ feePayer: sessionSigner.publicKey, blockhash, lastValidBlockHeight });
        tx.add(ix);
        tx.sign(sessionSigner);

        const signature = await connectionRef.current.sendRawTransaction(
          tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        invalidateBlockhash(); // blockhash consumed by this TX
        const result = await connectionRef.current.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        // Check for on-chain errors (e.g. instruction error even if TX landed in a block)
        if (result.value?.err) {
          console.error("Move TX failed on-chain:", result.value.err);
          setPosition({ x: position.x, y: position.y }); // revert optimistic
          setStatus("");
          return;
        }

        // Move confirmed — position is (newX, newY)
        // Don't read back from RPC; it can return stale data causing rubber-banding
        setPosition({ x: newX, y: newY });
        setStatus("Moved");

        // Mine gold at current position (mineGold fetches fresh position from chain)
        if (hasGoldAt(newX, newY)) {
          const mined = await mineGold();
          if (!mined) setStatus("");
        } else {
          setStatus("");
        }
      } catch (err: any) {
        const errMsg = String(err?.message || "");

        // "This transaction has already been processed" means the TX actually went through
        // — treat as success, not an error
        if (errMsg.includes("already been processed")) {
          setPosition({ x: newX, y: newY });
          setStatus("Moved");
          if (hasGoldAt(newX, newY)) {
            const mined = await mineGold();
            if (!mined) setStatus("");
          } else {
            setStatus("");
          }
          return;
        }

        console.error("Move failed:", err);
        setStatus("");
        // Invalidate cached blockhash on expiry so next action fetches fresh
        if (err?.name === "TransactionExpiredBlockheightExceededError" ||
            errMsg.includes("block height exceeded")) {
          invalidateBlockhash();
        }
        setPosition(playerState.position);
      } finally {
        setIsMoving(false);
      }
    },
    [sessionKeypair, sessionPubkey, playerState, position, lastMoveTime, fundSessionKey, mineGold, getBlockhash, invalidateBlockhash]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: { [key: string]: Direction } = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up, s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left, d: Direction.Right, D: Direction.Right,
      };
      const direction = keyMap[e.key];
      if (direction) { e.preventDefault(); move(direction); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  const canMove = Boolean(sessionKeypair && sessionPubkey && playerState && !isMoving);
  return { position, visibleGold, visiblePlayers, showPlayers, toggleShowPlayers, isMoving, lastMoveTime, move, canMove, goldMined, status };
}
