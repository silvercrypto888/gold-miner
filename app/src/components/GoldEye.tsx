"use client";

import { useRef, useEffect } from "react";

interface GoldEyeProps {
  goldCount: number;
}

/* ── Palette ── */
const DEEP_BLUE: [number, number, number] = [13, 27, 82];    // #0d1b52
const GOLD:      [number, number, number] = [255, 215, 0];    // #ffd700
const ORANGE:    [number, number, number] = [255, 140, 0];    // #ff8c00

/* ── Dimensions ──
   Each logical "pixel" = PIXEL_SIZE × PIXEL_SIZE screen pixels.
   The eye is a 20×14 ellipse of these logical pixels.           */
const EYE_W = 20;
const EYE_H = 14;
const PIXEL_SIZE = 2;
const CANVAS_W = EYE_W * PIXEL_SIZE; // 40
const CANVAS_H = EYE_H * PIXEL_SIZE; // 28
const PUPIL_R = 3;                    // pupil radius in logical pixels

/* ── Helpers ── */
function inEllipse(px: number, py: number, rx: number, ry: number): boolean {
  const cx = (EYE_W - 1) / 2;
  const cy = (EYE_H - 1) / 2;
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
}

export function GoldEye({ goldCount }: GoldEyeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let phase = 0;

    const draw = () => {
      phase += 0.025;
      const t = (Math.sin(phase) + 1) / 2;  // 0…1 oscillator

      // Interpolated gold → orange
      const r = Math.round(GOLD[0]  + (ORANGE[0] - GOLD[0])  * t);
      const g = Math.round(GOLD[1]  + (ORANGE[1] - GOLD[1])  * t);
      const b = Math.round(GOLD[2]  + (ORANGE[2] - GOLD[2])  * t);

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      for (let py = 0; py < EYE_H; py++) {
        for (let px = 0; px < EYE_W; px++) {
          // Skip pixels outside the eye ellipse
          if (!inEllipse(px, py, EYE_W / 2 - 0.5, EYE_H / 2 - 0.5)) continue;

          // Circular pupil
          if (inEllipse(px, py, PUPIL_R, PUPIL_R)) {
            ctx.fillStyle = "#000000";
          } else {
            // Dither pattern: even rows alternate deep-blue / gold,
            // odd rows are all deep-blue.
            const isGoldRow  = py % 2 === 0;
            const isGoldPx   = isGoldRow && px % 2 === 0;
            ctx.fillStyle = isGoldPx
              ? `rgb(${r},${g},${b})`
              : `rgb(${DEEP_BLUE[0]},${DEEP_BLUE[1]},${DEEP_BLUE[2]})`;
          }

          // Each logical pixel occupies PIXEL_SIZE×PIXEL_SIZE real pixels
          ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="bg-gray-900/90 backdrop-blur px-3 pt-2 pb-1.5 rounded-lg border border-gray-700">
      <div className="text-[10px] text-gray-400 text-center mb-0.5 tracking-wider uppercase">
        Gold Sense
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          imageRendering: "pixelated",
          display: "block",
          margin: "0 auto",
          width: CANVAS_W,
          height: CANVAS_H,
        }}
      />
      <div className="text-[10px] text-gray-500 text-center mt-0.5">
        {goldCount} nearby
      </div>
    </div>
  );
}
