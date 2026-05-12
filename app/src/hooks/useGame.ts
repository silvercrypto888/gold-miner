"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
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
import { GoldMinerIDL, directionToAnchor } from "@/lib/idl";

interface UseGameReturn {
  position: Position;
  visibleGold: GoldSpot[];
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
}

const MOVE_COOLDOWN_MS = 400;

export function useGame(): UseGameReturn {
  const { sessionKeypair, sessionPubkey, playerState, refreshPlayerState } =
    useSessionKey();
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const connectionRef = useRef<Connection | null>(null);
  const programRef = useRef<Program | null>(null);

  // Initialize connection and program
  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
    if (playerState?.wallet && sessionKeypair) {
      const provider = new AnchorProvider(
        connectionRef.current,
        {
          publicKey: playerState.wallet,
          signTransaction: async (_tx: Transaction) => _tx, // We sign manually
        } as any,
        { commitment: "confirmed" }
      );
      programRef.current = new Program(GoldMinerIDL as any, provider);
    }
  }, [playerState?.wallet, sessionKeypair]);

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
      if (!sessionKeypair || !sessionPubkey || !playerState || !programRef.current || !connectionRef.current) {
        console.log("Cannot move: missing session or program");
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

        // Build movePlayer instruction (simplified: only sessionSigner, player, systemProgram)
        const ix = await programRef.current.methods
          .movePlayer(directionToAnchor(direction))
          .accounts({
            sessionSigner: sessionSigner.publicKey,
            player: playerPda,
            systemProgram: web3.SystemProgram.programId,
          })
          .instruction();

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