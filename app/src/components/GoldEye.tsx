"use client";

import { useRef, useEffect } from "react";

interface GoldEyeProps {
  goldCount: number;
}

/* ── Palette ── */
const DEEP_BLUE: [number, number, number] = [13, 27, 82];    // #0d1b52
const GOLD:      [number, number, number] = [255, 215, 0];    // #ffd700
const ORANGE:    [number, number, number] = [255, 140, 0];    // #ff8c00

/* ── Larger eye ── */
const EYE_W = 40;
const EYE_H = 28;
const PIXEL_SIZE = 2;
const CANVAS_W = EYE_W * PIXEL_SIZE; // 80
const CANVAS_H = EYE_H * PIXEL_SIZE; // 56
const PUPIL_R = 6;                    // pupil radius in logical pixels

function inEllipse(px: number, py: number, rx: number, ry: number): boolean {
  const cx = (EYE_W - 1) / 2;
  const cy = (EYE_H - 1) / 2;
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
}

interface Spark {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
}

export function GoldEye({ goldCount }: GoldEyeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef  = useRef(0);
  const sparksRef = useRef<Spark[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let phase = 0;
    let lastSpawn = 0;

    const draw = () => {
      phase += 0.025;
      const t = (Math.sin(phase) + 1) / 2;
      const r = Math.round(GOLD[0]  + (ORANGE[0] - GOLD[0])  * t);
      const g = Math.round(GOLD[1]  + (ORANGE[1] - GOLD[1])  * t);
      const b = Math.round(GOLD[2]  + (ORANGE[2] - GOLD[2])  * t);
      const goldColor = `rgb(${r},${g},${b})`;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const hasGold = goldCount >= 5;

      // ── Draw base eye ──
      for (let py = 0; py < EYE_H; py++) {
        for (let px = 0; px < EYE_W; px++) {
          if (!inEllipse(px, py, EYE_W / 2 - 0.5, EYE_H / 2 - 0.5)) continue;

          // Circular pupil
          if (inEllipse(px, py, PUPIL_R, PUPIL_R)) {
            ctx.fillStyle = "#000000";
          } else {
            // Dither: even rows alternate blue/gold, odd rows all blue
            const isGoldRow = py % 2 === 0;
            const isGoldPx  = isGoldRow && px % 2 === 0;
            if (hasGold && isGoldPx) {
              ctx.fillStyle = goldColor;
            } else {
              ctx.fillStyle = `rgb(${DEEP_BLUE[0]},${DEEP_BLUE[1]},${DEEP_BLUE[2]})`;
            }
          }

          ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }

      // ── Sparks overlay ──
      const sparkSize = goldCount >= 50 ? 4 : 2;
      const spawnInterval = Math.max(5, 40 - Math.floor(goldCount * 0.6));
      const maxSparks = Math.min(35, 4 + Math.floor(goldCount / 3));
      const speedBase = 1 + Math.floor(goldCount / 30);
      const eyeCx = (EYE_W - 1) / 2;
      const eyeCy = (EYE_H - 1) / 2;

      lastSpawn++;
      if (hasGold && lastSpawn >= spawnInterval) {
        lastSpawn = 0;
        if (sparksRef.current.length < maxSparks) {
          // Spawn along right edge within eye
          const sy = PUPIL_R + 2 + Math.random() * (EYE_H - 2 * PUPIL_R - 4);
          if (inEllipse(EYE_W - 1, sy, EYE_W / 2 - 0.5, EYE_H / 2 - 0.5)) {
            sparksRef.current.push({
              x: EYE_W - 1,
              y: sy,
              w: sparkSize,
              h: sparkSize,
              speed: speedBase + Math.random() * 1.5,
            });
          }
        }
      }

      // Update & draw sparks
      sparksRef.current = sparksRef.current.filter(s => {
        s.x -= s.speed * 0.4;
        // Discard once fully left of the eye
        if (s.x + s.w < 0) return false;

        const scx = s.x + s.w / 2;
        const scy = s.y + s.h / 2;

        // Only draw if center of spark is inside eye AND outside pupil
        if (inEllipse(scx, scy, EYE_W / 2 - 0.5, EYE_H / 2 - 0.5) &&
            !inEllipse(scx, scy, PUPIL_R, PUPIL_R)) {
          ctx.fillStyle = goldColor;
          ctx.fillRect(
            Math.round(s.x) * PIXEL_SIZE,
            Math.round(s.y) * PIXEL_SIZE,
            s.w * PIXEL_SIZE,
            s.h * PIXEL_SIZE
          );
        }
        return true;
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [goldCount]);

  return (
    <div className="bg-gray-900/90 backdrop-blur rounded-lg border border-gray-700 flex items-center justify-center p-2"
         style={{ minWidth: CANVAS_W + 16, minHeight: CANVAS_H + 16 }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          imageRendering: "pixelated",
          display: "block",
          width: CANVAS_W,
          height: CANVAS_H,
        }}
      />
    </div>
  );
}
