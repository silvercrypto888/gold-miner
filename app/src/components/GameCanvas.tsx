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
import { Direction } from "@/types";

export function GameCanvas() {
  const { publicKey } = useWallet();
  const { position, visibleGold, isMoving, move } = useGame();
  const { sessionPubkey, playerState, joinGame, startSession, isLoading, error } =
    useSessionKey();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayPosition, setDisplayPosition] = useState(position);
  const animationRef = useRef<number | null>(null);
  const lastPositionRef = useRef(position);

  // Smooth interpolation of position
  useEffect(() => {
    if (
      position.x !== lastPositionRef.current.x ||
      position.y !== lastPositionRef.current.y
    ) {
      const startPos = { ...lastPositionRef.current };
      const startTime = Date.now();
      const duration = 150; // ms for animation

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);

        setDisplayPosition({
          x: startPos.x + (position.x - startPos.x) * eased,
          y: startPos.y + (position.y - startPos.y) * eased,
        });

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          lastPositionRef.current = position;
        }
      };

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [position]);

  // Draw the grid
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const size = VIEWPORT_SIZE * CELL_SIZE;
    canvas.width = size;
    canvas.height = size;

    // Clear canvas
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, size, size);

    const { minX, maxX, minY, maxY } = getViewportRange(
      Math.round(displayPosition.x),
      Math.round(displayPosition.y)
    );

    // Draw grid lines
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1;

    // Calculate offset for smooth scrolling
    const offsetX = (displayPosition.x - Math.floor(displayPosition.x)) * CELL_SIZE;
    const offsetY = (displayPosition.y - Math.floor(displayPosition.y)) * CELL_SIZE;

    // Draw cells
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const screenX = (x - minX) * CELL_SIZE - offsetX;
        const screenY = (maxY - y) * CELL_SIZE + offsetY; // Flip Y for display

        // Draw cell background
        const isDark = (x + y) % 2 === 0;
        ctx.fillStyle = isDark ? "#1f2937" : "#374151";
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);

        // Draw grid border
        ctx.strokeRect(screenX, screenY, CELL_SIZE, CELL_SIZE);

        // Draw coordinates on edge cells
        if (x === minX || y === maxY) {
          ctx.fillStyle = "#6b7280";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          if (x === minX && y % 10 === 0) {
            ctx.fillText(String(y), screenX + 15, screenY + 20);
          }
          if (y === maxY && x % 10 === 0) {
            ctx.fillText(String(x), screenX + CELL_SIZE / 2, screenY + 30);
          }
        }

        // Draw gold if present and unmined
        const goldSpot = visibleGold.find(
          (g) => g.x === x && g.y === y
        );
        if (goldSpot && goldSpot.hasGold) {
          const centerX = screenX + CELL_SIZE / 2;
          const centerY = screenY + CELL_SIZE / 2;

          // Gold glow
          const gradient = ctx.createRadialGradient(
            centerX,
            centerY,
            2,
            centerX,
            centerY,
            CELL_SIZE / 2
          );
          gradient.addColorStop(0, "#fbbf24");
          gradient.addColorStop(0.5, "#f59e0b");
          gradient.addColorStop(1, "transparent");

          ctx.fillStyle = gradient;
          ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);

          // Gold core
          ctx.beginPath();
          ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#fbbf24";
          ctx.fill();
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw player
    const playerScreenX = (displayPosition.x - minX) * CELL_SIZE + CELL_SIZE / 2 - offsetX;
    const playerScreenY =
      (maxY - displayPosition.y) * CELL_SIZE + CELL_SIZE / 2 + offsetY;

    // Player glow
    const playerGradient = ctx.createRadialGradient(
      playerScreenX,
      playerScreenY,
      4,
      playerScreenX,
      playerScreenY,
      16
    );
    playerGradient.addColorStop(0, "rgba(59, 130, 246, 0.8)");
    playerGradient.addColorStop(1, "transparent");
    ctx.fillStyle = playerGradient;
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Player circle
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Player inner
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#93c5fd";
    ctx.fill();
  }, [displayPosition, visibleGold]);

  // Redraw on state changes
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // Handle clicks on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to grid coordinates
    const { minX, maxY } = getViewportRange(
      Math.round(displayPosition.x),
      Math.round(displayPosition.y)
    );
    const offsetX = (displayPosition.x - Math.floor(displayPosition.x)) * CELL_SIZE;
    const offsetY = (displayPosition.y - Math.floor(displayPosition.y)) * CELL_SIZE;

    const gridX = Math.floor((clickX + offsetX) / CELL_SIZE) + minX;
    const gridY = maxY - Math.floor((clickY - offsetY) / CELL_SIZE);

    // Determine direction based on click relative to player
    const dx = gridX - Math.round(displayPosition.x);
    const dy = gridY - Math.round(displayPosition.y);

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) move(Direction.Right);
      else if (dx < 0) move(Direction.Left);
    } else {
      if (dy > 0) move(Direction.Up);
      else if (dy < 0) move(Direction.Down);
    }
  };

  // Not connected state
  if (!publicKey) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700 text-center">
        <div className="text-6xl mb-4">⛏️</div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6">
          Connect your wallet to start mining gold on the X1 grid
        </p>
        <div className="flex justify-center">
          <div className="bg-gray-700 px-6 py-3 rounded-lg text-gray-300">
            Click the Connect Wallet button in the header
          </div>
        </div>
      </div>
    );
  }

  // Not joined state
  if (!playerState) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700 text-center">
        <div className="text-6xl mb-4">🎮</div>
        <h2 className="text-2xl font-bold text-white mb-2">Join the Game</h2>
        <p className="text-gray-400 mb-6">
          Create your player account and start your gold mining journey
        </p>
        <button
          onClick={joinGame}
          disabled={isLoading}
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Joining..." : "Join Game"}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }

  // No active session
  if (!sessionPubkey) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700 text-center">
        <div className="text-6xl mb-4">🔑</div>
        <h2 className="text-2xl font-bold text-white mb-2">Start Session</h2>
        <p className="text-gray-400 mb-6">
          Initialize your session key to start moving without wallet popups
        </p>
        <button
          onClick={startSession}
          disabled={isLoading}
          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Starting..." : "Start Session"}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* Canvas container */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-pointer block mx-auto"
          style={{
            imageRendering: "pixelated",
            boxShadow: "inset 0 0 50px rgba(0,0,0,0.5)",
          }}
        />

        {/* Position overlay */}
        <div className="absolute top-4 left-4 bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400">Position</div>
          <div className="text-xl font-mono font-bold text-white">
            ({Math.round(position.x)}, {Math.round(position.y)})
          </div>
        </div>

        {/* Gold nearby indicator */}
        <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400">Gold Spots</div>
          <div className="text-xl font-bold text-yellow-400">
            {visibleGold.length} visible
          </div>
        </div>
      </div>

      {/* Controls hint */}
      <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-700 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Use <span className="text-white font-mono bg-gray-700 px-1 rounded">WASD</span>
          {" or "}
          <span className="text-white font-mono bg-gray-700 px-1 rounded">Arrow Keys</span>
          {" to move"}
        </div>
        <div className="text-sm text-gray-400">
          Session Key: {" "}
          <span className="text-green-400">Active</span>
        </div>
      </div>
    </div>
  );
}
