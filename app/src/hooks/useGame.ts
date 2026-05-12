"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair } from "@solana/web3.js";
import { useSessionKey } from "./useSessionKey";
import { Position, Direction, GoldSpot } from "@/types";
import {
  getProgramId,
  RPC_URL,
  GRID_SIZE,
  hasGoldAt,
  getViewportRange,
  getPlayerPda,
} from "@/lib/constants";

interface UseGameReturn {
  position: Position;
  visibleGold: GoldSpot[];
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
}

const MOVE_COOLDOWN_MS = 400;

// movePlayer discriminator: sha256("global:move_player")[0..8]
const MOVE_PLAYER_DISC = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);

// Direction enum variant index: Up=0, Down=1, Left=2, Right=3
const DIRECTION_VARIANT: Record<Direction, number> = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
};

export function useGame(): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, refreshPlayerState } =
    useSessionKey();
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const connectionRef = useRef<Connection | null>(null);

  // Initialize connection
  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
  }, []);

  // Update position when player state changes
  useEffect(() => {
    if (playerState) {
      setPosition(playerState.position);
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

  // Move player — sends actual on-chain transaction signed by session key
  const move = useCallback(
    async (direction: Direction) => {
      if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current) {
        console.log("Cannot move: missing session or connection");
        return;
      }

      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) {
        return;
      }

      // Calculate new position
      let newX = position.x;
      let newY = position.y;

      switch (direction) {
        case Direction.Up:
          newY = Math.min(GRID_SIZE, position.y + 1);
          break;
        case Direction.Down:
          newY = Math.max(1, position.y - 1);
          break;
        case Direction.Left:
          newX = Math.max(1, position.x - 1);
          break;
        case Direction.Right:
          newX = Math.min(GRID_SIZE, position.x + 1);
          break;
      }

      if (newX === position.x && newY === position.y) {
        return; // No change
      }

      setIsMoving(true);
      setLastMoveTime(now);

      // Optimistic update
      setPosition({ x: newX, y: newY });

      try {
        const programId = getProgramId();
        if (!playerState.wallet) throw new Error("Player wallet not set");
        const walletPk = playerState.wallet;
        const [playerPda] = getPlayerPda(walletPk, programId);
        const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);

        // Build movePlayer instruction manually (avoids Anchor codec issues)
        // Data: 8-byte discriminator + 1-byte direction variant index
        const data = Buffer.concat([
          MOVE_PLAYER_DISC,
          Buffer.from([DIRECTION_VARIANT[direction]]),
        ]);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: false },
            { pubkey: playerPda, isSigner: false, isWritable: true },
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
          ],
          programId,
          data,
        });

        const { blockhash, lastValidBlockHeight } =
          await connectionRef.current.getLatestBlockhash();

        const tx = new Transaction({
          feePayer: walletPk,
          blockhash,
          lastValidBlockHeight,
        });
        tx.add(ix);
        tx.partialSign(sessionSigner);

        // Send transaction (session key signs, no wallet popup needed)
        const signature = await connectionRef.current.sendRawTransaction(
          tx.serialize(),
          { skipPreflight: false, preflightCommitment: "confirmed" }
        );

        await connectionRef.current.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        // Refresh from chain after confirmed move
        await refreshPlayerState();
      } catch (err: any) {
        console.error("Move failed:", err);
        // Revert optimistic update on failure
        setPosition(playerState.position);
      } finally {
        setIsMoving(false);
      }
    },
    [sessionKeypair, sessionPubkey, playerState, position, lastMoveTime, refreshPlayerState]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: { [key: string]: Direction } = {
        ArrowUp: Direction.Up,
        ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left,
        ArrowRight: Direction.Right,
        w: Direction.Up,
        W: Direction.Up,
        s: Direction.Down,
        S: Direction.Down,
        a: Direction.Left,
        A: Direction.Left,
        d: Direction.Right,
        D: Direction.Right,
      };

      const direction = keyMap[e.key];
      if (direction) {
        e.preventDefault();
        move(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  const canMove = Boolean(
    sessionKeypair && sessionPubkey && playerState && !isMoving
  );

  return {
    position,
    visibleGold,
    isMoving,
    lastMoveTime,
    move,
    canMove,
  };
}