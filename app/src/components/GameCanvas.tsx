"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useGame } from "@/hooks/useGame";
import { useSessionKey } from "@/hooks/useSessionKey";
import {
  GRID_SIZE,
  VIEWPORT_SIZE,
  CELL_SIZE,
  hasGoldAt,
  getViewportRange,
} from "@/lib/constants";
import { Direction, OtherPlayer } from "@/types";
import { drawGoldIcosahedrons, renderOctahedron } from "@/lib/icosahedron";

export function GameCanvas({ onPlaySound }: { onPlaySound?: (name: "mine" | "walk") => void }) {
  const { publicKey } = useWallet();
  const { position, visibleGold, visiblePlayers, showPlayers, toggleShowPlayers, isMoving, move, status, goldMined } = useGame();
  const { sessionPubkey, playerState, joinGame, startSession, isLoading, error } =
    useSessionKey();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rAFRef = useRef<number>(0);
  const displayPosRef = useRef(position);
  const goldRef = useRef(visibleGold);
  const playersRef = useRef(visiblePlayers);
  const showPlayersRef = useRef(showPlayers);
  const posSmoothRef = useRef({ start: position, end: position, startTime: 0, duration: 0 });
  const size = VIEWPORT_SIZE * CELL_SIZE;

  // Play sound effects on status changes
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (onPlaySound && status !== prevStatusRef.current) {
      if (status === "Mined!") onPlaySound("mine");
      else if (status === "Moved") onPlaySound("walk");
      prevStatusRef.current = status;
    }
  }, [status, onPlaySound]);

  // Keep refs in sync with state
  useEffect(() => { goldRef.current = visibleGold; }, [visibleGold]);
  useEffect(() => { playersRef.current = visiblePlayers; }, [visiblePlayers]);
  useEffect(() => { showPlayersRef.current = showPlayers; }, [showPlayers]);

  // Smooth position interpolation — triggered when position changes
  useEffect(() => {
    posSmoothRef.current = {
      start: { ...displayPosRef.current },
      end: { ...position },
      startTime: performance.now(),
      duration: 150,
    };
  }, [position]);

  // ── Persistent render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    let stopped = false;

    function render(now: number) {
      if (stopped) return;

      // Compute interpolated display position
      const sm = posSmoothRef.current;
      const elapsed = now - sm.startTime;
      const t = Math.min(elapsed / sm.duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const dx = sm.start.x + (sm.end.x - sm.start.x) * ease;
      const dy = sm.start.y + (sm.end.y - sm.start.y) * ease;
      displayPosRef.current = { x: dx, y: dy };

      const goldSpots = goldRef.current;
      const otherPlayers = playersRef.current;
      const showP = showPlayersRef.current;

      const { minX, maxX, minY, maxY } = getViewportRange(Math.round(dx), Math.round(dy));
      const offX = (dx - Math.floor(dx)) * CELL_SIZE;
      const offY = (dy - Math.floor(dy)) * CELL_SIZE;

      // Background
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, size, size);

      // Cells + collect gold positions for icosahedron
      const goldScreenPositions: { x: number; y: number; screenX: number; screenY: number }[] = [];

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const sx = (x - minX) * CELL_SIZE - offX;
          const sy = (maxY - y) * CELL_SIZE + offY;

          ctx.fillStyle = (x + y) % 2 === 0 ? "#1f2937" : "#374151";
          ctx.fillRect(sx, sy, CELL_SIZE, CELL_SIZE);

          // Edge labels
          if (x === minX || y === maxY) {
            ctx.fillStyle = "#6b7280";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            if (x === minX && y % 10 === 0) ctx.fillText(String(y), sx + 15, sy + 20);
            if (y === maxY && x % 10 === 0) ctx.fillText(String(x), sx + CELL_SIZE / 2, sy + 30);
          }

          if (goldSpots.find(g => g.x === x && g.y === y && g.hasGold)) {
            goldScreenPositions.push({ x, y, screenX: sx + CELL_SIZE / 2, screenY: sy + CELL_SIZE / 2 });
          }
        }
      }

      // 3D icosahedrons (one offscreen render, drawImage N times)
      if (goldScreenPositions.length > 0) {
        drawGoldIcosahedrons(ctx, goldScreenPositions, now, CELL_SIZE - 4);
      }

      // Grid lines
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = 1;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          ctx.strokeRect(
            (x - minX) * CELL_SIZE - offX,
            (maxY - y) * CELL_SIZE + offY,
            CELL_SIZE, CELL_SIZE
          );
        }
      }

      // Player (upright octahedron with specular highlight, same rot speed as gold)
      const px = (dx - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
      const py = (maxY - dy) * CELL_SIZE + CELL_SIZE / 2 + offY;

      const octaCanvas = renderOctahedron(now, CELL_SIZE - 4, 1.5);
      ctx.drawImage(octaCanvas, px - (CELL_SIZE - 4) / 2, py - (CELL_SIZE - 4) / 2);

      // Other players
      if (showP) {
        for (const op of otherPlayers) {
          if (op.x < minX || op.x > maxX || op.y < minY || op.y > maxY) continue;
          const opx = (op.x - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
          const opy = (maxY - op.y) * CELL_SIZE + CELL_SIZE / 2 + offY;

          const og = ctx.createRadialGradient(opx, opy, 4, opx, opy, 14);
          og.addColorStop(0, "rgba(34, 197, 94, 0.5)");
          og.addColorStop(1, "transparent");
          ctx.fillStyle = og;
          ctx.beginPath();
          ctx.arc(opx, opy, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(opx, opy, 10, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(34, 197, 94, 0.6)";
          ctx.fill();
          ctx.strokeStyle = "rgba(74, 222, 128, 0.8)";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(opx, opy, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(187, 247, 208, 0.9)";
          ctx.fill();
        }
      }

      rAFRef.current = requestAnimationFrame(render);
    }

    rAFRef.current = requestAnimationFrame(render);
    return () => { stopped = true; cancelAnimationFrame(rAFRef.current); };
  }, []);

  // Handle clicks on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const dp = displayPosRef.current;
    const { minX: vpMinX, maxY: vpMaxY } = getViewportRange(Math.round(dp.x), Math.round(dp.y));
    const offX = (dp.x - Math.floor(dp.x)) * CELL_SIZE;
    const offY = (dp.y - Math.floor(dp.y)) * CELL_SIZE;

    const gridX = Math.floor((clickX + offX) / CELL_SIZE) + vpMinX;
    const gridY = vpMaxY - Math.floor((clickY - offY) / CELL_SIZE);

    const dx = gridX - Math.round(dp.x);
    const dy = gridY - Math.round(dp.y);

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) move(Direction.Right);
      else if (dx < 0) move(Direction.Left);
    } else {
      if (dy > 0) move(Direction.Up);
      else if (dy < 0) move(Direction.Down);
    }
  };

  // ── Overlay screens ──

  let overlay: React.ReactNode = null;

  if (!publicKey) {
    overlay = (
      <div className="absolute inset-0 z-10 bg-gray-900/95 rounded-xl flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">⛏️</div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6 text-center">
          Connect your wallet to start mining gold on the X1 grid
        </p>
        <div className="bg-gray-700 px-6 py-3 rounded-lg text-gray-300">
          Click the Connect Wallet button in the header
        </div>
      </div>
    );
  } else if (!playerState) {
    overlay = (
      <div className="absolute inset-0 z-10 bg-gray-900/95 rounded-xl flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🎮</div>
        <h2 className="text-2xl font-bold text-white mb-2">Join the Game</h2>
        <p className="text-gray-400 mb-6 text-center">
          Create your player account and start your gold mining journey
        </p>
        <button
          onClick={joinGame}
          disabled={isLoading}
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Joining..." : "Join Game"}
        </button>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    );
  } else if (!sessionPubkey) {
    overlay = (
      <div className="absolute inset-0 z-10 bg-gray-900/95 rounded-xl flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🔑</div>
        <h2 className="text-2xl font-bold text-white mb-2">Start Session</h2>
        <p className="text-gray-400 mb-6 text-center">
          Initialize your session key to start moving without wallet popups
        </p>
        <button
          onClick={startSession}
          disabled={isLoading}
          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Starting..." : "Start Session"}
        </button>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  const showHUD = publicKey && playerState && sessionPubkey;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden relative">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="cursor-pointer block"
        style={{
          imageRendering: "pixelated",
          boxShadow: "inset 0 0 50px rgba(0,0,0,0.5)",
          marginLeft: "5%",
          width: size,
          height: size,
        }}
      />

      {overlay}

      {showHUD && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          {status && (
            <div className={`backdrop-blur px-4 py-2 rounded-lg border ${
              status === "Moving..." || status === "Mining..."
                ? "bg-yellow-900/80 border-yellow-600 text-yellow-300"
                : status === "Moved"
                  ? "bg-blue-900/80 border-blue-600 text-blue-300"
                  : "bg-green-900/80 border-green-600 text-green-300"
            }`}>
              <div className="text-sm">{status === "Moving..." || status === "Mining..." ? "⏳" : status === "Moved" ? "👟" : "⛏️"} {status}</div>
            </div>
          )}
          <div className="bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700">
            <div className="text-sm text-gray-400">Gold Spots</div>
            <div className="text-xl font-bold text-yellow-400">
              {visibleGold.filter(g => g.hasGold).length} remaining
            </div>
          </div>
          <div className="bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700">
            <div className="text-sm text-gray-400">Position</div>
            <div className="text-xl font-mono font-bold text-white">
              ({Math.round(position.x)}, {Math.round(position.y)})
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-700 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Use <span className="text-white font-mono bg-gray-700 px-1 rounded">WASD</span>
          {" or "}
          <span className="text-white font-mono bg-gray-700 px-1 rounded">Arrow Keys</span>
          {" to move"}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleShowPlayers}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              showPlayers
                ? "bg-green-600/30 border-green-500 text-green-400"
                : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500"
            }`}
          >
            {showPlayers ? "👁 Players: ON" : "👁 Players: OFF"}
          </button>
          <div className="text-sm text-gray-400">
            Session Key:{" "}
            <span className="text-green-400">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
