"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
  GOLD_PER_MINE,
  getToken2022ProgramId,
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

// Derive Associated Token Account address
function getAta(mint: PublicKey, owner: PublicKey): PublicKey {
  const tokenProgram = getToken2022ProgramId();
  const ataProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ataProgram
  )[0];
}

export function useGame(): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, refreshPlayerState, fundSessionKey } =
    useSessionKey();
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [goldMined, setGoldMined] = useState(0);
  const connectionRef = useRef<Connection | null>(null);
  const goldiumMintRef = useRef<PublicKey | null>(null);

  // Initialize connection
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
          // GameConfig layout: 8(disc) + 32(authority) + 4(grid_size) + 32(goldium_mint) ...
          goldiumMintRef.current = new PublicKey(configInfo.data.slice(44, 76));
        }
      } catch (e) {
        console.error("Failed to fetch goldium mint:", e);
      }
    })();
  }, []);

  // Update position when player state changes
  useEffect(() => {
    if (playerState) {
      setPosition(playerState.position);
      setGoldMined(playerState.goldiumMinted);
    }
  }, [playerState]);

  // Calculate visible gold spots in viewport
  const updateVisibleGold = useCallback(() => {
    const { minX, maxX, minY, maxY } = getViewportRange(position.x, position.y);
    const goldSpots: GoldSpot[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) {
          goldSpots.push({ x, y, hasGold: true });
        }
      }
    }

    setVisibleGold(goldSpots);
  }, [position]);

  // Update visible gold when position changes
  useEffect(() => {
    updateVisibleGold();
  }, [updateVisibleGold]);

  // Mine gold at current position
  const mineGold = useCallback(async (): Promise<boolean> => {
    if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current || !goldiumMintRef.current) {
      return false;
    }

    if (!hasGoldAt(position.x, position.y)) {
      return false;
    }

    try {
      const programId = getProgramId();
      const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);
      const walletPk = playerState.wallet;
      if (!walletPk) return false;

      const [playerPda] = getPlayerPda(walletPk, programId);
      const [gameConfigPda] = getGameConfigPda(programId);
      const [goldSpotPda] = getGoldSpotPda(position.x, position.y, programId);
      const goldiumMint = goldiumMintRef.current;
      const playerAta = getAta(goldiumMint, playerPda);

      const { blockhash, lastValidBlockHeight } =
        await connectionRef.current.getLatestBlockhash();

      const tx = new Transaction({
        feePayer: sessionSigner.publicKey,
        blockhash,
        lastValidBlockHeight,
      });

      // Check if player's goldium ATA exists — if not, create it
      const ataInfo = await connectionRef.current.getAccountInfo(playerAta);
      if (!ataInfo) {
        console.log("Creating goldium ATA...");
        // Create ATA instruction: ATA program creates the account
        const ataProgramId = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        const tokenProgram = getToken2022ProgramId();
        const createAtaIx = new TransactionInstruction({
          keys: [
            { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: true },  // payer
            { pubkey: playerAta, isSigner: false, isWritable: true },               // ATA
            { pubkey: playerPda, isSigner: false, isWritable: false },              // owner
            { pubkey: goldiumMint, isSigner: false, isWritable: false },            // mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
          ],
          programId: ataProgramId,
          data: Buffer.alloc(0), // ATA create instruction has no data
        });
        tx.add(createAtaIx);
      }

      // Build mineGold instruction
      const mineIx = new TransactionInstruction({
        keys: [
          { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: true },
          { pubkey: gameConfigPda, isSigner: false, isWritable: true },
          { pubkey: playerPda, isSigner: false, isWritable: true },
          { pubkey: goldSpotPda, isSigner: false, isWritable: true },
          { pubkey: goldiumMint, isSigner: false, isWritable: true },
          { pubkey: playerAta, isSigner: false, isWritable: true },
          { pubkey: getToken2022ProgramId(), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: MINE_GOLD_DISC,
      });
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
      await refreshPlayerState();
      return true;
    } catch (err: any) {
      console.error("Mine gold failed:", err);
      return false;
    }
  }, [sessionKeypair, sessionPubkey, playerState, position]);

  // Move player — session key is fee payer (no wallet popup)
  const move = useCallback(
    async (direction: Direction) => {
      if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) {
        return;
      }

      let newX = position.x;
      let newY = position.y;

      switch (direction) {
        case Direction.Up:    newY = Math.min(GRID_SIZE, position.y + 1); break;
        case Direction.Down:  newY = Math.max(1, position.y - 1); break;
        case Direction.Left:  newX = Math.max(1, position.x - 1); break;
        case Direction.Right: newX = Math.min(GRID_SIZE, position.x + 1); break;
      }

      if (newX === position.x && newY === position.y) return;

      setIsMoving(true);
      setLastMoveTime(now);
      setPosition({ x: newX, y: newY });

      try {
        const programId = getProgramId();
        const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);

        // Check session key balance
        const balance = await connectionRef.current.getBalance(sessionSigner.publicKey);
        if (balance < 5000) {
          const { blockhash: fundBh, lastValidBlockHeight: fundLvb } =
            await connectionRef.current.getLatestBlockhash();
          try {
            await fundSessionKey(sessionSigner.publicKey, fundBh, fundLvb);
          } catch (e) {
            console.warn("Failed to fund session key:", e);
          }
        }

        const walletPk = playerState.wallet;
        if (!walletPk) { setPosition(playerState.position); return; }
        const [playerPda] = getPlayerPda(walletPk, programId);

        const data = Buffer.concat([
          MOVE_PLAYER_DISC,
          Buffer.from([DIRECTION_VARIANT[direction]]),
        ]);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: false },
            { pubkey: playerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId,
          data,
        });

        const { blockhash, lastValidBlockHeight } =
          await connectionRef.current.getLatestBlockhash();

        const tx = new Transaction({
          feePayer: sessionSigner.publicKey,
          blockhash,
          lastValidBlockHeight,
        });
        tx.add(ix);
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

        await refreshPlayerState();

        // Try to mine gold at new position
        if (hasGoldAt(newX, newY)) {
          await mineGold();
        }
      } catch (err: any) {
        console.error("Move failed:", err);
        setPosition(playerState.position);
      } finally {
        setIsMoving(false);
      }
    },
    [sessionKeypair, sessionPubkey, playerState, position, lastMoveTime, refreshPlayerState, fundSessionKey, mineGold]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: { [key: string]: Direction } = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up,
        s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left,
        d: Direction.Right, D: Direction.Right,
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