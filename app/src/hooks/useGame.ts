"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useSessionKey } from "./useSessionKey";
import { Position, Direction, GoldSpot } from "@/types";
import {
  getProgramId,
  RPC_URL,
  GRID_SIZE,
  hasGoldAt,
  getViewportRange,
} from "@/lib/constants";
import { directionToAnchor } from "@/lib/idl";

interface UseGameReturn {
  position: Position;
  visibleGold: GoldSpot[];
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
}

const MOVE_COOLDOWN_MS = 400; // Match X1 block time

export function useGame(): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, refreshPlayerState } =
    useSessionKey();
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const connectionRef = useRef<Connection | null>(null);
  const moveQueueRef = useRef<Direction[]>([]);

  // Lazy-init connection client-side only
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

  // Move player
  const move = useCallback(
    async (direction: Direction) => {
      if (!sessionKeypair || !sessionPubkey || !playerState) {
        console.log("Cannot move: no session");
        return;
      }

      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) {
        console.log("Move on cooldown");
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

      try {
        // In a full implementation, this would send a transaction
        // For now, we'll just update the local state
        // The actual transaction would be:
        /*
        const [goldSpotPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("gold_spot"),
            Buffer.from([newX & 0xff, (newX >> 8) & 0xff]),
            Buffer.from([newY & 0xff, (newY >> 8) & 0xff]),
          ],
          getProgramId()
        );

        const instruction = program.methods.movePlayer(directionToAnchor(direction.toLowerCase() as any))
          .accounts({ ... })
          .instruction();
        
        // Sign with session key and send
        */

        // Optimistic update
        setPosition({ x: newX, y: newY });

        // After a short delay, refresh from chain
        setTimeout(() => {
          refreshPlayerState();
        }, MOVE_COOLDOWN_MS);
      } catch (err) {
        console.error("Move failed:", err);
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
