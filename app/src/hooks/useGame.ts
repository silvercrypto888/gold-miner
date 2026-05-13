"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useSessionKey } from "./useSessionKey";
import { Position, Direction, GoldSpot } from "@/types";
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
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
  goldMined: number;
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
  const connectionRef = useRef<Connection | null>(null);
  const goldiumMintRef = useRef<PublicKey | null>(null);
  // Timestamp of last authoritative on-chain position read.
  // Prevents stale playerState updates from overwriting position.
  const lastChainPositionRef = useRef<number>(0);

  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
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

  // Sync goldiumMinted from playerState (always safe).
  // Position sync is blocked for 3 seconds after a direct on-chain read
  // to prevent stale RPC data from rubber-banding the player.
  useEffect(() => {
    if (playerState) {
      setGoldMined(playerState.goldiumMinted);
      const now = Date.now();
      if (now - lastChainPositionRef.current > 3000) {
        setPosition(playerState.position);
      }
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
  // When called from move(), knownPosition is passed in to avoid re-fetching.
  // When called standalone (e.g. page refresh on a gold spot), knownPosition is undefined
  // and we fetch from chain.
  const mineGold = useCallback(async (knownPosition?: Position): Promise<boolean> => {
    if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current || !goldiumMintRef.current) {
      return false;
    }

    try {
      const programId = getProgramId();
      const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);
      const walletPk = playerState.wallet;
      if (!walletPk) return false;

      const [playerPda] = getPlayerPda(walletPk, programId);
      let onChainX: number;
      let onChainY: number;

      if (knownPosition) {
        // Use position passed from move() — already confirmed on-chain
        onChainX = knownPosition.x;
        onChainY = knownPosition.y;
      } else {
        // Standalone call — fetch position from chain
        try {
          const playerInfo = await connectionRef.current.getAccountInfo(playerPda, 'confirmed');
          if (!playerInfo) return false;
          onChainX = playerInfo.data.readUInt32LE(72);
          onChainY = playerInfo.data.readUInt32LE(76);
        } catch (fetchErr) {
          console.error("Failed to fetch player account for mineGold:", fetchErr);
          return false;
        }
      }

      if (!hasGoldAt(onChainX, onChainY)) return false;

      const [gameConfigPda] = getGameConfigPda(programId);
      const [goldSpotPda] = getGoldSpotPda(onChainX, onChainY, programId);

      // Batch-fetch player + gold_spot in one RPC call when we need both
      let goldSpotInfo: { data: Buffer } | null;
      if (knownPosition) {
        // Already have player data from move, just need gold_spot
        goldSpotInfo = await connectionRef.current.getAccountInfo(goldSpotPda, 'confirmed');
      } else {
        // Need both — batch fetch
        const [playerAcct, goldSpotAcct] = await connectionRef.current.getMultipleAccountsInfo(
          [playerPda, goldSpotPda], 'confirmed'
        );
        if (!playerAcct) return false;
        goldSpotInfo = goldSpotAcct;
      }

      if (goldSpotInfo) {
        const hasGold = goldSpotInfo.data[8] === 1;
        if (!hasGold) {
          console.log(`Gold at (${onChainX}, ${onChainY}) already mined, skipping`);
          return false;
        }
      }
      const goldiumMint = goldiumMintRef.current;
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
          { pubkey: goldSpotPda, isSigner: false, isWritable: true },                   // gold_spot (init_if_needed)
          { pubkey: goldiumMint, isSigner: false, isWritable: true },                    // goldium_mint
          { pubkey: playerAta, isSigner: false, isWritable: true },                      // player_token_account (associated_token init_if_needed)
          { pubkey: tokenProgram, isSigner: false, isWritable: false },                  // token_program
          { pubkey: ataProgram, isSigner: false, isWritable: false },                   // associated_token_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // system_program
        ],
        programId,
        data: MINE_GOLD_DISC,
      });

      const { blockhash, lastValidBlockHeight } =
        await connectionRef.current.getLatestBlockhash();

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

      await connectionRef.current.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      console.log("Gold mined! TX:", signature);
      setGoldMined(prev => prev + GOLD_PER_MINE);
      lastChainPositionRef.current = Date.now();

      // Refresh gold visibility — the spot we just mined should disappear
      await updateVisibleGold();
      return true;
    } catch (err: any) {
      console.error("Mine gold failed:", err);
      if (err?.logs) console.error("Program logs:", err.logs.join("\n"));
      return false;
    }
  }, [sessionKeypair, sessionPubkey, playerState, position, updateVisibleGold]);

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

      try {
        const programId = getProgramId();
        const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);

        const balance = await connectionRef.current.getBalance(sessionSigner.publicKey);
        if (balance < 5_000_000) {
          const { blockhash: fundBh, lastValidBlockHeight: fundLvb } =
            await connectionRef.current.getLatestBlockhash();
          try { await fundSessionKey(sessionSigner.publicKey, fundBh, fundLvb); }
          catch (e) { console.warn("Failed to fund session key:", e); }
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

        const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
        const tx = new Transaction({ feePayer: sessionSigner.publicKey, blockhash, lastValidBlockHeight });
        tx.add(ix);
        tx.sign(sessionSigner);

        const signature = await connectionRef.current.sendRawTransaction(
          tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        await connectionRef.current.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

        // Read the actual on-chain position after confirmation to avoid stale RPC data.
        const confirmedInfo = await connectionRef.current.getAccountInfo(playerPda, 'confirmed');
        let confirmedPosition: Position = { x: newX, y: newY };
        if (confirmedInfo) {
          confirmedPosition = {
            x: confirmedInfo.data.readUInt32LE(72),
            y: confirmedInfo.data.readUInt32LE(76),
          };
          setPosition(confirmedPosition);
        }
        lastChainPositionRef.current = Date.now();

        // Mine gold at the confirmed on-chain position (no extra RPC calls needed)
        if (hasGoldAt(confirmedPosition.x, confirmedPosition.y)) {
          await mineGold(confirmedPosition);
        }
      } catch (err: any) {
        console.error("Move failed:", err);
        setPosition(playerState.position);
      } finally {
        setIsMoving(false);
      }
    },
    [sessionKeypair, sessionPubkey, playerState, position, lastMoveTime, fundSessionKey, mineGold]
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
  return { position, visibleGold, isMoving, lastMoveTime, move, canMove, goldMined };
}
