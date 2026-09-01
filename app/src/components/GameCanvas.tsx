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
  isCellMined,
} from "@/lib/constants";
import { Direction, OtherPlayer, PlayerState } from "@/types";
import { drawGoldIcosahedrons, renderOctahedron, PLAYER_PALETTE_LIME } from "@/lib/icosahedron";
import { GoldEye } from "@/components/GoldEye";

// Pre-built tile textures with cluster-dithered marble (lazy, cached at module level)
let _darkTile: HTMLCanvasElement | null = null;
let _lightTile: HTMLCanvasElement | null = null;

function buildTile(baseHex: string, accentHex: string): HTMLCanvasElement {
  const tc = document.createElement('canvas');
  tc.width = CELL_SIZE; tc.height = CELL_SIZE;
  const tctx = tc.getContext('2d')!;
  tctx.fillStyle = baseHex;
  tctx.fillRect(0, 0, CELL_SIZE, CELL_SIZE);
  // Dense cross pattern: 3×3 cross (+) every 5px, alternating rows staggered by 2px
  // This yields a close symmetric weave
  tctx.fillStyle = accentHex;
  const crossPixels = [[1,0],[0,1],[1,1],[2,1],[1,2]];
  const stride = 5;
  const rows = Math.floor(CELL_SIZE / stride);
  for (let row = 0; row < rows; row++) {
    const yOff = row * stride + 1; // center of 3px cross in 5px block
    const xStart = (row % 2 === 0) ? 0 : 2; // stagger odd rows
    for (let bx = 0; bx < Math.floor((CELL_SIZE - xStart) / stride); bx++) {
      const xOff = xStart + bx * stride + 1;
      for (const [dx, dy] of crossPixels) {
        tctx.fillRect(xOff + dx - 1, yOff + dy - 1, 1, 1);
      }
    }
  }
  return tc;
}

export function GameCanvas({ onPlaySound }: { onPlaySound?: (name: "mine" | "walk" | "enter_foresight" | "exit_foresight" | "winter_wind" | "bell" | "angelical_pad" | "cinematic_boom") => void }) {
  const { publicKey } = useWallet();
  const { sessionKeypair, sessionPubkey, playerState, joinGame, startSession, fundSessionKey, isLoading, error, isSessionValid, clearSession } =
    useSessionKey();
  const { position, visibleGold, visiblePlayers, showPlayers, toggleShowPlayers, isMoving, move, status, goldMined, getBitmap, getHiddenMines } = useGame({
    sessionKeypair,
    sessionPubkey,
    playerState,
    fundSessionKey,
    startSession,
    isSessionValid,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rAFRef = useRef<number>(0);
  const displayPosRef = useRef(position);
  const goldRef = useRef(visibleGold);
  const playersRef = useRef(visiblePlayers);
  const showPlayersRef = useRef(showPlayers);
  const posSmoothRef = useRef({ start: position, end: position, startTime: 0, duration: 0 });
  const size = VIEWPORT_SIZE * CELL_SIZE;

  // ── Foresight Mode ──
  const [foresightMode, setForesightMode] = useState(false);
  const foresightPosRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });

  // ── Gold Sense toggle ──
  const [goldSenseEnabled, setGoldSenseEnabled] = useState(false);

  // Sync foresightPos with real position when NOT in foresight mode, or on toggle ON
const prevForesightRef = useRef(foresightMode);
  useEffect(() => {
    if (foresightMode && !prevForesightRef.current) {
      // Just toggled ON — snap shade to player's current position
      foresightPosRef.current = { ...position };
    }
    prevForesightRef.current = foresightMode;
  }, [foresightMode, position]);

  // Play foresight sounds only on toggle (separate effect avoids position-dependency noise)
  const prevForesightSoundRef = useRef(foresightMode);
  useEffect(() => {
    if (!onPlaySound) { prevForesightSoundRef.current = foresightMode; return; }
    const wasOn = prevForesightSoundRef.current;
    if (foresightMode && !wasOn) {
      onPlaySound("enter_foresight");
    } else if (!foresightMode && wasOn) {
      onPlaySound("exit_foresight");
    }
    prevForesightSoundRef.current = foresightMode;
  }, [foresightMode, onPlaySound]);

  // ── Dramatic events ──
  const [dramaticMsg, setDramaticMsg] = useState<string | null>(null);
  const dramaticTimers = useRef<Record<string, number>>({
    posPower: 0,
    goldMedium: 0,
    goldRich: 0,
    heartbeat: 0,
  });

  // Trigger dramatic event helper (handles cooldown + message + sound)
  const triggerDramatic = useCallback(
    (cooldownKey: string, message: string | null, sound: string) => {
      if (!onPlaySound) return;
      const now = Date.now();
      if (now < dramaticTimers.current[cooldownKey]) return;
      const cooldownMs = cooldownKey === "heartbeat" ? 0 : 180_000; // heartbeat uses dynamic cooldown set below
      dramaticTimers.current[cooldownKey] = now + cooldownMs;
      if (message) setDramaticMsg(message);
      onPlaySound(sound as any);
    },
    [onPlaySound]
  );

  // Auto-dismiss dramatic message after 6s
  useEffect(() => {
    if (!dramaticMsg) return;
    const t = setTimeout(() => setDramaticMsg(null), 6000);
    return () => clearTimeout(t);
  }, [dramaticMsg]);

  // Power-of-2 position sum — mystery event
  const prevPosRef = useRef(position);
  useEffect(() => {
    if (!onPlaySound) return;
    const { x, y } = position;
    if (x === prevPosRef.current.x && y === prevPosRef.current.y) return;
    prevPosRef.current = position;
    const sum = Math.round(x) + Math.round(y);
    const isPowerOf2 = sum >= 64 && sum <= 512 && (sum & (sum - 1)) === 0;
    if (isPowerOf2) {
      triggerDramatic("posPower", '"Is something out there?..."', "winter_wind");
    }
  }, [position, onPlaySound, triggerDramatic]);

  // Prev gold count bracket for heartbeat reset detection
  const prevHeartbeatBracketRef = useRef(-1);

  // Gold density events + heartbeat — checks visible gold count periodically
  useEffect(() => {
    const id = setInterval(() => {
      const count = goldRef.current.filter(g => g.hasGold).length;
      // Status events (with messages)
      if (count >= 25 && count <= 49) {
        triggerDramatic("goldMedium", "Plenty of gold here!", "bell");
      } else if (count >= 50) {
        triggerDramatic("goldRich", "It's the motherlode!", "angelical_pad");
      }
      // Heartbeat — dynamic cooldown based on gold density (sound only, no message)
      const heartbeatCd = count >= 50 ? 30_000 : count >= 25 ? 60_000 : 90_000;
      const bracket = count >= 50 ? 2 : count >= 25 ? 1 : 0;
      if (bracket !== prevHeartbeatBracketRef.current) {
        // Bracket changed — reset timer so it doesn't fire immediately after speed-up
        dramaticTimers.current.heartbeat = Date.now() + heartbeatCd;
        prevHeartbeatBracketRef.current = bracket;
      }
      if (onPlaySound && Date.now() >= dramaticTimers.current.heartbeat) {
        dramaticTimers.current.heartbeat = Date.now() + heartbeatCd;
        onPlaySound("cinematic_boom");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [onPlaySound, triggerDramatic]);

  // Capture-phase keydown: when foresight ON, intercept WASD/arrows before useGame's handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!foresightMode) return;
      // Only intercept movement keys
      const moveKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "W", "s", "S", "a", "A", "d", "D"];
      if (!moveKeys.includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const dirMap: Record<string, { dx: number; dy: number }> = {
        ArrowUp: { dx: 0, dy: 1 }, ArrowDown: { dx: 0, dy: -1 },
        ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
        w: { dx: 0, dy: 1 }, W: { dx: 0, dy: 1 },
        s: { dx: 0, dy: -1 }, S: { dx: 0, dy: -1 },
        a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
        d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
      };
      const { dx, dy } = dirMap[e.key];
      const fp = foresightPosRef.current;
      const nx = fp.x + dx;
      const ny = fp.y + dy;

      // Bounds check
      if (nx < 1 || nx > GRID_SIZE || ny < 1 || ny > GRID_SIZE) return;

      // Manhattan distance cap from player's real position
      const dist = Math.abs(nx - position.x) + Math.abs(ny - position.y);
      if (dist > 40) return;

      foresightPosRef.current = { x: nx, y: ny };
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [foresightMode, position]);

  // Play sound effects on status changes
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (onPlaySound && status !== prevStatusRef.current) {
      if (status.startsWith("Mined")) onPlaySound("mine");
      else if (status === "Moved") onPlaySound("walk");
      prevStatusRef.current = status;
    }
  }, [status, onPlaySound]);

  // Mining burst particles — spiral-out motion, viewport-relative render
  interface BurstParticle {
    ox: number;      // grid x at origin
    oy: number;      // grid y at origin
    angle: number;   // initial direction (radians)
    speed: number;   // radial speed (cells/second)
    size: number;
    startTime: number;
  }
  const TWIST_RATE = 2.0; // rad/s — moderate spiral, ~1 full turn over particle lifetime
  const particlesRef = useRef<BurstParticle[]>([]);

  // Spawn burst when a mine happens
  const prevMinedRef = useRef(false);
  useEffect(() => {
    const isMined = status.startsWith("Mined");
    if (isMined && !prevMinedRef.current) {
      const now = performance.now();
      const particles: BurstParticle[] = [];
      // 40 fixed 4x4 pixel squares, no size variance
      for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 / 40) * i + (Math.random() - 0.5) * 0.3;
        const speed = 0.15 + Math.random() * 0.35;  // cells/second — tighter spread, same duration
        particles.push({
          ox: position.x,
          oy: position.y,
          angle,
          speed,
          size: 4,
          startTime: now,
        });
      }
      particlesRef.current.push(...particles);
      setTimeout(() => {
        const cutoff = performance.now() - 3000;
        particlesRef.current = particlesRef.current.filter(p => p.startTime >= cutoff);
      }, 3100);
    }
    prevMinedRef.current = isMined;
  }, [status, position]);

  // Keep refs in sync with state
  useEffect(() => { goldRef.current = visibleGold; }, [visibleGold]);
  useEffect(() => { playersRef.current = visiblePlayers; }, [visiblePlayers]);
  useEffect(() => { showPlayersRef.current = showPlayers; }, [showPlayers]);

  // ── Nearby sparks: gentle particles from gold spots adjacent to player ──
  interface NearbySpark {
    ox: number; oy: number;
    angle: number; speed: number;
    startTime: number;
  }
  const nearbySparksRef = useRef<NearbySpark[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const px = Math.round(position.x);
      const py = Math.round(position.y);
      const neighbors = [
        { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      ];
      for (const { dx, dy } of neighbors) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 1 || nx > GRID_SIZE || ny < 1 || ny > GRID_SIZE) continue;
        if (hasGoldAt(nx, ny) && visibleGold.some(g => g.x === nx && g.y === ny && g.hasGold)) {
          // Spawn 5 tiny sparks from each adjacent gold spot
          for (let i = 0; i < 9; i++) {
            nearbySparksRef.current.push({
              ox: nx, oy: ny,
              angle: Math.random() * Math.PI * 2,
              speed: 0.08 + Math.random() * 0.12,
              startTime: now + Math.random() * 200, // stagger slightly
            });
          }
        }
      }
    }, 400); // every 400ms while adjacent
    return () => clearInterval(interval);
  }, [position, visibleGold]);

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
  const foresightRef = useRef(foresightMode);
  foresightRef.current = foresightMode;
  const playerPosRef = useRef(position);
  playerPosRef.current = position;

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

      const isForesight = foresightRef.current;
      const realPos = playerPosRef.current;

      // Compute the viewport center: normal player position, or foresight shade position
      let viewX: number, viewY: number;
      if (isForesight) {
        viewX = foresightPosRef.current.x;
        viewY = foresightPosRef.current.y;
      } else {
        // Compute interpolated display position for smooth player movement
        const sm = posSmoothRef.current;
        const elapsed = now - sm.startTime;
        const t = Math.min(elapsed / sm.duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        viewX = sm.start.x + (sm.end.x - sm.start.x) * ease;
        viewY = sm.start.y + (sm.end.y - sm.start.y) * ease;
      }
      displayPosRef.current = { x: viewX, y: viewY };

      const goldSpots = goldRef.current;
      const otherPlayers = playersRef.current;
      const showP = showPlayersRef.current;

      // Bitmap for live mined-status in foresight mode
      const cachedBitmap = getBitmap ? getBitmap() : null;
      const hiddenMines = getHiddenMines ? getHiddenMines() : new Set<string>();

      const { minX, maxX, minY, maxY } = getViewportRange(Math.round(viewX), Math.round(viewY));
      const offX = (viewX - Math.floor(viewX)) * CELL_SIZE;
      const offY = (viewY - Math.floor(viewY)) * CELL_SIZE;

      // Background
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, size, size);

      // Build gold Set for O(1) lookup + screen positions for icosahedrons
      const goldKeySet = new Set<string>();
      for (const g of goldSpots) {
        if (g.hasGold) goldKeySet.add(`${g.x},${g.y}`);
      }
      // Build adjacent-gold gleam set (empty tiles 1 tile away from gold)
      const gleamKeySet = new Set<string>();
      goldKeySet.forEach((key) => {
        const [gx, gy] = key.split(',').map(Number);
        for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
          const nx = gx + dx, ny = gy + dy;
          const nKey = `${nx},${ny}`;
          if (!goldKeySet.has(nKey)) gleamKeySet.add(nKey);
        }
      });
      const goldScreenPositions: { x: number; y: number; screenX: number; screenY: number }[] = [];

      // Lazily init tile textures once
      if (!_darkTile) { _darkTile = buildTile("#1f2937", "#2b3544"); }
      if (!_lightTile) { _lightTile = buildTile("#374151", "#414b5a"); }

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const sx = (x - minX) * CELL_SIZE - offX;
          const sy = (maxY - y) * CELL_SIZE + offY;
          const isDark = (x + y) % 2 === 0;
          ctx.drawImage(isDark ? _darkTile : _lightTile, sx, sy);

          // ── Gold Gleam: subtle radial golden glow on empty tiles adjacent to gold ──
          if (gleamKeySet.has(`${x},${y}`)) {
            const cx = sx + CELL_SIZE / 2;
            const cy = sy + CELL_SIZE / 2;
            const r = CELL_SIZE / 2;
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            // Time-synced warm pulse: matches spark gold → amber cycle
            const cycle = (Math.sin(now / 800) + 1) / 2; // 0..1, ~2.5s period
            const rr = Math.round(180 + 75 * cycle);
            const gg = Math.round(150 + 70 * cycle);
            const aa = (0.08 + 0.05 * cycle).toFixed(3);
            grd.addColorStop(0, `rgba(${rr},${gg},0,${aa})`);
            grd.addColorStop(1, `rgba(${rr},${gg},0,0)`);
            ctx.fillStyle = grd;
            ctx.fillRect(sx, sy, CELL_SIZE, CELL_SIZE);
          }

          // Edge labels
          if (x === minX || y === maxY) {
            ctx.fillStyle = "#6b7280";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            if (x === minX && y % 10 === 0) ctx.fillText(String(y), sx + 15, sy + 20);
            if (y === maxY && x % 10 === 0) ctx.fillText(String(x), sx + CELL_SIZE / 2, sy + 30);
          }

          const goldFormula = hasGoldAt(x, y);

          let hasGold = false;
          if (goldFormula) {
            if (isForesight && cachedBitmap) {
              // In foresight: check bitmap + hidden mines (recently mined, not yet on-chain)
              const minedOut = isCellMined(cachedBitmap, x, y) || hiddenMines.has(`${x},${y}`);
              hasGold = !minedOut;
            } else {
              // Normal mode: use useGame's gold spots which are already filtered
              hasGold = goldKeySet.has(`${x},${y}`);
            }
          }

          if (hasGold) {
            const entry = { x, y, screenX: sx + CELL_SIZE / 2, screenY: sy + CELL_SIZE / 2 };
            goldScreenPositions.push(entry);
          }
        }
      }

      // 3D icosahedrons (confirmed gold — fully opaque)
      if (goldScreenPositions.length > 0) {
        drawGoldIcosahedrons(ctx, goldScreenPositions, now, CELL_SIZE - 4);
      }

      // Grid lines — single path, single stroke
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          ctx.rect(
            (x - minX) * CELL_SIZE - offX,
            (maxY - y) * CELL_SIZE + offY,
            CELL_SIZE, CELL_SIZE
          );
        }
      }
      ctx.stroke();

      // Foresight shade — translucent octahedron at view center
      if (isForesight) {
        const shadeX = (viewX - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
        const shadeY = (maxY - viewY) * CELL_SIZE + CELL_SIZE / 2 + offY;
        const octaCanvas = renderOctahedron(now, CELL_SIZE - 4, 1.5);
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(octaCanvas, shadeX - (CELL_SIZE - 4) / 2, shadeY - (CELL_SIZE - 4) / 2);
        ctx.restore();

        // Outline around shade for visibility
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          shadeX - CELL_SIZE / 2, shadeY - CELL_SIZE / 2,
          CELL_SIZE, CELL_SIZE
        );

        // Also render the real player at their actual location (if visible in viewport)
        const rpx = (realPos.x - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
        const rpy = (maxY - realPos.y) * CELL_SIZE + CELL_SIZE / 2 + offY;
        const isRealVisible = realPos.x >= minX && realPos.x <= maxX && realPos.y >= minY && realPos.y <= maxY;
        if (isRealVisible) {
          const realOcta = renderOctahedron(now, CELL_SIZE - 4, 1.5);
          ctx.drawImage(realOcta, rpx - (CELL_SIZE - 4) / 2, rpy - (CELL_SIZE - 4) / 2);

          // Glow ring under real player (cached gradient, no allocation per frame)
          const glow = ctx.createRadialGradient(rpx, rpy, 2, rpx, rpy, 16);
          glow.addColorStop(0, "rgba(250, 204, 21, 0.4)");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(rpx, rpy, 16, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Normal mode: render player (upright octahedron with specular highlight)
        const px = (viewX - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
        const py = (maxY - viewY) * CELL_SIZE + CELL_SIZE / 2 + offY;
        const octaCanvas = renderOctahedron(now, CELL_SIZE - 4, 1.5);
        ctx.drawImage(octaCanvas, px - (CELL_SIZE - 4) / 2, py - (CELL_SIZE - 4) / 2);
      }

      // Other players — each rendered as a lime green spinning octahedron
      // Skip any player on the same tile as you — your blue octahedron takes priority
      if (showP) {
        const myGridX = Math.round(isForesight ? realPos.x : viewX);
        const myGridY = Math.round(isForesight ? realPos.y : viewY);
        for (const op of otherPlayers) {
          if (op.x < minX || op.x > maxX || op.y < minY || op.y > maxY) continue;
          // Skip — your blue octahedron already occupies this tile
          if (op.x === myGridX && op.y === myGridY) continue;
          const opx = (op.x - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
          const opy = (maxY - op.y) * CELL_SIZE + CELL_SIZE / 2 + offY;

          // Glow ring under other player
          const og = ctx.createRadialGradient(opx, opy, 2, opx, opy, 16);
          og.addColorStop(0, "rgba(34, 197, 94, 0.4)");
          og.addColorStop(1, "transparent");
          ctx.fillStyle = og;
          ctx.beginPath();
          ctx.arc(opx, opy, 16, 0, Math.PI * 2);
          ctx.fill();

          // Lime green octahedron for other players
          const otherOcta = renderOctahedron(now, CELL_SIZE - 4, 1.5, PLAYER_PALETTE_LIME);
          ctx.drawImage(otherOcta, opx - (CELL_SIZE - 4) / 2, opy - (CELL_SIZE - 4) / 2);
        }
      }

      // Mining burst particles — grid-relative, viewport-aware
      if (particlesRef.current.length > 0) {
        // Match Gold Sense color oscillation (phase = 1.5 rad/s to match GoldEye's 0.025/frame at ~60fps)
        const gsPhase = (now / 1000) * 1.5;
        const gsT = (Math.sin(gsPhase) + 1) / 2;
        const gsG = Math.round(215 + (140 - 215) * gsT);
        const particleColor = `rgb(255,${gsG},0)`;
        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const elapsed = now - p.startTime;
          if (elapsed > 3000) { particles.splice(i, 1); continue; }
          // Spiral-out — angle rotates over time for a gentle twisting effect
          const t = elapsed / 1000;
          const twistAngle = p.angle + t * TWIST_RATE;
          const gx = p.ox + Math.cos(twistAngle) * p.speed * t;
          const gy = p.oy + Math.sin(twistAngle) * p.speed * t;

          // Convert to screen coords using current viewport
          const psx = (gx - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
          const psy = (maxY - gy) * CELL_SIZE + CELL_SIZE / 2 + offY;

          ctx.fillStyle = particleColor;
          // 8-pixel spark pattern: corners + 2x2 center (no edge pixels)
          const bx = Math.round(psx) - 2;
          const by = Math.round(psy) - 2;
          ctx.fillRect(bx,     by,     1, 1);
          ctx.fillRect(bx + 3, by,     1, 1);
          ctx.fillRect(bx + 1, by + 1, 1, 1);
          ctx.fillRect(bx + 2, by + 1, 1, 1);
          ctx.fillRect(bx + 1, by + 2, 1, 1);
          ctx.fillRect(bx + 2, by + 2, 1, 1);
          ctx.fillRect(bx,     by + 3, 1, 1);
          ctx.fillRect(bx + 3, by + 3, 1, 1);
        }
      }

      // ── Nearby gold sparks: smaller, shorter-lived ──
      if (nearbySparksRef.current.length > 0) {
        const sparks = nearbySparksRef.current;
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          const elapsed = now - s.startTime;
          if (elapsed > 2200) { sparks.splice(i, 1); continue; } // modest lifetime: 2.2s
          const t = elapsed / 1000;
          const twistAngle = s.angle + t * 1.5; // gentler twist
          const gx = s.ox + Math.cos(twistAngle) * s.speed * t;
          const gy = s.oy + Math.sin(twistAngle) * s.speed * t;

          const ssx = (gx - minX) * CELL_SIZE + CELL_SIZE / 2 - offX;
          const ssy = (maxY - gy) * CELL_SIZE + CELL_SIZE / 2 + offY;

          // Warm golden fade: start bright, fade to amber
          const fade = 1 - (elapsed / 2200);
          const r = Math.round(255 * fade + 180 * (1 - fade));
          const g = Math.round(220 * fade + 150 * (1 - fade));
          ctx.fillStyle = `rgba(${r},${g},0,${fade})`;
          // 2x2 pixel (subtle sparkle)
          ctx.fillRect(Math.round(ssx) - 1, Math.round(ssy) - 1, 2, 2);
        }
      }

      rAFRef.current = requestAnimationFrame(render);
    }

    rAFRef.current = requestAnimationFrame(render);
    return () => { stopped = true; cancelAnimationFrame(rAFRef.current); };
  }, []);

  // Handle clicks on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (foresightMode) return; // no movement in foresight mode

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
  } else if (sessionPubkey && !isSessionValid()) {
    overlay = (
      <div className="absolute inset-0 z-10 bg-gray-900/95 rounded-xl flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">⏳</div>
        <h2 className="text-2xl font-bold text-white mb-2">Session Expired</h2>
        <p className="text-gray-400 mb-6 text-center">
          Your session key has expired. Start a new session to keep mining.
        </p>
        <button
          onClick={startSession}
          disabled={isLoading}
          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Starting..." : "Start New Session"}
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
                : status.startsWith("Mined")
                  ? "bg-green-900/80 border-green-600 text-green-300"
                  : "bg-blue-900/80 border-blue-600 text-blue-300"
            }`}>
              <div className="text-sm">{status === "Moving..." || status === "Mining..." ? "⏳" : status.startsWith("Mined") ? "⛏️" : "👟"} {status}</div>
            </div>
          )}
          {dramaticMsg && (
            <div className="backdrop-blur px-4 py-3 rounded-lg border border-purple-500/40 bg-purple-900/70 text-purple-200 animate-pulse">
              <div className="text-sm">{dramaticMsg}</div>
            </div>
          )}
          <div className="bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700 text-center">
            <div className="text-sm text-gray-400">Gold Spots</div>
            <div className="text-xl font-bold text-yellow-400">
              {visibleGold.filter(g => g.hasGold).length} remaining
            </div>
          </div>
          <div className="bg-gray-900/90 backdrop-blur px-4 py-2 rounded-lg border border-gray-700 text-center">
            <div className="text-sm text-gray-400">Position</div>
            <div className="text-xl font-mono font-bold text-white">
              ({Math.round(position.x)}, {Math.round(position.y)})
            </div>
          </div>
          {/* Foresight Mode toggle — below position panel */}
          <button
            onClick={() => setForesightMode(f => !f)}
            className={`backdrop-blur px-4 py-2 rounded-lg border transition-all ${
              foresightMode
                ? "bg-indigo-700/80 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/20"
                : "bg-gray-800/80 border-gray-600 text-gray-400 hover:border-gray-500"
            }`}
          >
            <div className="text-sm text-gray-400">Foresight</div>
            <div className="text-lg font-bold">
              {foresightMode ? "👁 ON" : "👁 OFF"}
            </div>
          </button>
          <button
            onClick={() => setGoldSenseEnabled(v => !v)}
            className={`backdrop-blur px-4 py-2 rounded-lg border transition-all min-w-[120px] flex items-center justify-center ${
              goldSenseEnabled
                ? "bg-gray-900/90 border-gray-700"
                : "bg-gray-800/90 border-gray-600 text-gray-300"
            }`}
          >
            {goldSenseEnabled ? (
              <GoldEye goldCount={visibleGold.filter(g => g.hasGold).length} />
            ) : (
              <div className="text-center">
                <div className="text-sm text-gray-400">Gold Sense</div>
                <div className="text-lg font-bold">OFF</div>
              </div>
            )}
          </button>
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
