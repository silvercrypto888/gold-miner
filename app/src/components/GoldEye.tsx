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
const CANVAS_W = EYE_W * PIXEL_SIZE;
const CANVAS_H = EYE_H * PIXEL_SIZE;
const PUPIL_R = 6;

function inEllipse(px: number, py: number, rx: number, ry: number): boolean {
  const cx = (EYE_W - 1) / 2;
  const cy = (EYE_H - 1) / 2;
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
}

/** Pre-build pupil pixels once */
const PUPIL_PIXELS: [number, number][] = [];
const IRIS_PIXELS: [number, number][] = [];
(function precompute() {
  for (let py = 0; py < EYE_H; py++) {
    for (let px = 0; px < EYE_W; px++) {
      if (!inEllipse(px, py, EYE_W / 2 - 1.5, EYE_H / 2 - 1.5)) continue;
      if (inEllipse(px, py, PUPIL_R, PUPIL_R)) {
        PUPIL_PIXELS.push([px, py]);
      } else {
        IRIS_PIXELS.push([px, py]);
      }
    }
  }
})();

interface Spark {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
}

export function GoldEye({ goldCount }: GoldEyeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef  = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const goldRef  = useRef(goldCount);
  const phaseRef = useRef(0);
  const lastSpawnRef = useRef(0);

  useEffect(() => { goldRef.current = goldCount; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let stopped = false;
    let framesSinceCheck = 0;

    const draw = () => {
      if (stopped) return;

      const gc = goldRef.current;
      const hasGold = gc >= 5;

      // No gold: one fillRect, skip expensive pixel loop
      if (!hasGold) {
        sparksRef.current = [];
        ctx.fillStyle = `rgb(${DEEP_BLUE[0]},${DEEP_BLUE[1]},${DEEP_BLUE[2]})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // ── Gold active: animate ──
      phaseRef.current += 0.025;
      const t = (Math.sin(phaseRef.current) + 1) / 2;
      const r = 255;
      const g = Math.round(215 + (140 - 215) * t);
      const b = 0;
      const goldColor = `rgb(${r},${g},${b})`;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw pupil (solid black rect — much faster than per-pixel fillRect)
      ctx.fillStyle = "#000000";
      for (const [px, py] of PUPIL_PIXELS) {
        ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }

      // Draw iris — gold-patterned where row+px is even; skip checks for each pixel
      ctx.fillStyle = `rgb(${DEEP_BLUE[0]},${DEEP_BLUE[1]},${DEEP_BLUE[2]})`;
      for (const [px, py] of IRIS_PIXELS) {
        const isGoldPx = py % 2 === 0 && px % 2 === 0;
        if (isGoldPx) {
          ctx.fillStyle = goldColor;
          ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
          ctx.fillStyle = `rgb(${DEEP_BLUE[0]},${DEEP_BLUE[1]},${DEEP_BLUE[2]})`;
        } else {
          ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }

      // ── Sparks overlay ──
      const sparkSize = gc >= 50 ? 4 : 2;
      const spawnFreq = Math.max(2, 8 - Math.floor(gc * 0.15));
      const maxSparks = Math.min(80, 8 + Math.floor(gc * 1.5));
      const speedBase = 0.3 + gc / 50;

      lastSpawnRef.current++;
      if (lastSpawnRef.current >= spawnFreq) {
        lastSpawnRef.current = 0;
        if (sparksRef.current.length < maxSparks) {
          const eyeRx = EYE_W / 2 - 1.5;
          const eyeRy = EYE_H / 2 - 1.5;
          const eyeCx = (EYE_W - 1) / 2;
          const eyeCy = (EYE_H - 1) / 2;
          const sx = eyeCx + eyeRx * 0.7 + (Math.random() - 0.5) * 4;
          const sy = eyeCy + (Math.random() - 0.5) * eyeRy * 1.2;
          if (inEllipse(sx, sy, eyeRx, eyeRy)) {
            sparksRef.current.push({
              x: sx, y: sy, w: sparkSize, h: sparkSize,
              dx: speedBase + Math.random() * 0.6,
            });
          }
        }
      }

      ctx.fillStyle = goldColor;
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x -= s.dx;
        if (s.x + s.w < 0) { sparks.splice(i, 1); continue; }
        const scx = s.x + s.w / 2;
        const scy = s.y + s.h / 2;
        if (inEllipse(scx, scy, EYE_W / 2 - 1.5, EYE_H / 2 - 1.5) &&
            !inEllipse(scx, scy, PUPIL_R, PUPIL_R)) {
          ctx.fillRect(
            Math.round(s.x) * PIXEL_SIZE,
            Math.round(s.y) * PIXEL_SIZE,
            s.w * PIXEL_SIZE, s.h * PIXEL_SIZE
          );
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { stopped = true; cancelAnimationFrame(animRef.current); };
  }, []);

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
