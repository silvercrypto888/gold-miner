"use client";

import { useRef, useEffect } from "react";

interface GoldEyeProps {
  goldCount: number;
}

/* ── Palette ── */
const DEEP_BLUE: [number, number, number] = [13, 27, 82];
const GOLD:      [number, number, number] = [255, 215, 0];
const ORANGE:    [number, number, number] = [255, 140, 0];

/* ── Larger eye ── */
const EYE_W = 40;
const EYE_H = 28;
const PIXEL_SIZE = 2;
const CANVAS_W = EYE_W * PIXEL_SIZE; // 80
const CANVAS_H = EYE_H * PIXEL_SIZE; // 56
const PUPIL_R = 6;

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
      const eyeRx = EYE_W / 2 - 1.5;
      const eyeRy = EYE_H / 2 - 1.5;
      const eyeCx = (EYE_W - 1) / 2;
      const eyeCy = (EYE_H - 1) / 2;

      // ── Draw base eye ──
      for (let py = 0; py < EYE_H; py++) {
        for (let px = 0; px < EYE_W; px++) {
          if (!inEllipse(px, py, eyeRx, eyeRy)) continue;

          if (inEllipse(px, py, PUPIL_R, PUPIL_R)) {
            ctx.fillStyle = "#000000";
          } else {
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
      if (hasGold) {
        const sparkSize = goldCount >= 50 ? 4 : 2;
        const spawnInterval = Math.max(3, 30 - Math.floor(goldCount * 0.5));
        const maxSparks = Math.min(60, 8 + Math.floor(goldCount / 2));
        const speedBase = 1 + Math.floor(goldCount / 20);

        lastSpawn++;
        if (lastSpawn >= spawnInterval) {
          lastSpawn = 0;
          if (sparksRef.current.length < maxSparks) {
            // Spawn on the interior right side of the eye — well inside so it always passes ellipse check
            const sx = eyeCx + eyeRx * 0.7 + (Math.random() - 0.5) * 4;
            const sy = eyeCy + (Math.random() - 0.5) * eyeRy * 1.2;
            if (inEllipse(sx, sy, eyeRx, eyeRy)) {
              sparksRef.current.push({
                x: sx,
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
          if (s.x + s.w < 0) return false;

          const scx = s.x + s.w / 2;
          const scy = s.y + s.h / 2;

          if (inEllipse(scx, scy, eyeRx, eyeRy) &&
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
      } else {
        sparksRef.current = [];
      }

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
