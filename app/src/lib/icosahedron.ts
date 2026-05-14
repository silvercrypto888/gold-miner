/**
 * Golden Icosahedron Renderer
 *
 * Renders a rotating 3D icosahedron with specular shading to an offscreen canvas.
 * Designed to be called once per animation frame — the offscreen canvas is cached
 * and can be drawImage'd at multiple positions without redoing 3D math.
 *
 * Usage:
 *   import { drawGoldIcosahedrons } from '@/lib/icosahedron';
 *
 *   // In your animation frame:
 *   drawGoldIcosahedrons(ctx, goldSpotScreenPositions, performance.now());
 */

const PHI = (1 + Math.sqrt(5)) / 2;

// 12 vertices of a regular icosahedron (centered at origin, edge length 2)
const ICOSA_VERTICES: [number, number, number][] = [
  [ 0,  1,  PHI], [ 0, -1,  PHI], [ 0,  1, -PHI], [ 0, -1, -PHI],
  [ 1,  PHI,  0], [-1,  PHI,  0], [ 1, -PHI,  0], [-1, -PHI,  0],
  [ PHI, 0,  1], [-PHI, 0,  1], [ PHI, 0, -1], [-PHI, 0, -1],
];

// 20 triangular faces (vertex indices)
const ICOSA_FACES: [number, number, number][] = [
  [0, 1, 8],  [0, 8, 4],  [0, 4, 5],   [0, 5, 9],   [0, 9, 1],
  [1, 6, 8],  [8, 10, 4], [4, 2, 5],   [5, 11, 9],  [9, 7, 1],
  [1, 7, 6],  [8, 6, 10], [4, 10, 2],  [5, 2, 11],  [9, 11, 7],
  [3, 6, 7],  [3, 10, 6],[3, 2, 10],  [3, 11, 2],  [3, 7, 11],
];

// Light direction (normalized) — from upper-right, slightly in front
const LIGHT = normalize([0.8, 0.8, 0.5]);

// Half-vector between light and view direction
// View direction from icosahedron surface to camera = (0, 0, -1)
const HALF_VEC = normalize([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

// ── Vector Math ──

function normalize(v: number[]): number[] {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return [v[0]/len, v[1]/len, v[2]/len];
}

function cross(a: number[], b: number[]): number[] {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function dot(a: number[], b: number[]): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

function vecSub(a: number[], b: number[]): number[] {
  return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
}

function rotateY(v: number[], angle: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c];
}

function computeFaceNormal(a: number[], b: number[], c: number[]): number[] {
  return normalize(cross(vecSub(b, a), vecSub(c, a)));
}

// ── Color Palettes ──

interface Palette {
  dark:   [number, number, number];
  bright: [number, number, number];
  spec:   [number, number, number];
  stroke: [number, number, number];
}

type PaletteName = 'gold' | 'emerald' | 'amethyst';

const PALETTES: Record<PaletteName, Palette> = {
  gold: {
    dark:   [0.45, 0.25, 0.02],
    bright: [0.95, 0.72, 0.10],
    spec:   [1.0,  0.90, 0.60],
    stroke: [0.85, 0.65, 0.10],
  },
  emerald: {
    dark:   [0.0,  0.25, 0.05],
    bright: [0.10, 0.90, 0.30],
    spec:   [0.60, 1.0,  0.70],
    stroke: [0.20, 0.95, 0.40],
  },
  amethyst: {
    dark:   [0.25, 0.05, 0.30],
    bright: [0.80, 0.25, 0.90],
    spec:   [0.90, 0.60, 1.0],
    stroke: [0.85, 0.35, 0.95],
  },
};

// ── Main Renderer ──

/** Reusable offscreen canvas — created once, reused every frame */
let _offscreenCanvas: HTMLCanvasElement | null = null;
let _lastSize = 0;

/**
 * Render one frame of the rotating icosahedron to an offscreen canvas.
 * All 3D math happens here once. The result can be drawImage'd N times.
 */
export function renderIcosahedron(
  timeMs: number,
  size = 48,
  palette: PaletteName = 'gold',
  rotSpeed = 1.5
): HTMLCanvasElement {
  // Reuse or create offscreen canvas
  if (!_offscreenCanvas || _lastSize !== size) {
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCanvas.width = size;
    _offscreenCanvas.height = size;
    _lastSize = size;
  }
  const canvas = _offscreenCanvas;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const colors = PALETTES[palette] || PALETTES.gold;
  const angle = (timeMs / 1000) * rotSpeed;

  // Step 1: Rotate all 12 vertices around Y axis
  const rotated = ICOSA_VERTICES.map(v => rotateY(v, angle));

  // Step 2: Orthographic projection to 2D screen coords
  const scale = size * 0.35;
  const projected = rotated.map(v => [
    v[0] * scale + size / 2,
    -v[1] * scale + size / 2,  // flip Y for screen coords
    v[2],                        // keep Z for depth sorting
  ]);

  // Step 3: Build face list with normals in world space, depth for sorting
  interface FaceData {
    i0: number; i1: number; i2: number;
    normal: number[];
    centerZ: number;
  }

  const faceData: FaceData[] = ICOSA_FACES.map(([i0, i1, i2]) => {
    const a = rotated[i0], b = rotated[i1], c = rotated[i2];
    const normal = computeFaceNormal(a, b, c);
    const centerZ = (projected[i0][2] + projected[i1][2] + projected[i2][2]) / 3;
    return { i0, i1, i2, normal, centerZ };
  });

  // Back-face cull + sort by depth (farthest first)
  const visibleFaces = faceData
    .filter(f => f.normal[2] < 0)
    .sort((a, b) => a.centerZ - b.centerZ);

  // Step 4: Draw each face (flat shading with specular highlight)
  for (const face of visibleFaces) {
    const p0 = projected[face.i0];
    const p1 = projected[face.i1];
    const p2 = projected[face.i2];

    // Diffuse: how directly the face points toward the light
    const diffuse = Math.max(0, dot(face.normal, LIGHT));

    // Specular: tight white highlight that sweeps facets
    const specular = Math.pow(Math.max(0, dot(face.normal, HALF_VEC)), 48);

    // Blend: dark base → bright color (diffuse) → white spec highlight
    const sr = colors.dark[0] + (colors.bright[0] - colors.dark[0]) * diffuse
             + colors.spec[0] * specular * 0.6;
    const sg = colors.dark[1] + (colors.bright[1] - colors.dark[1]) * diffuse
             + colors.spec[1] * specular * 0.6;
    const sb = colors.dark[2] + (colors.bright[2] - colors.dark[2]) * diffuse
             + colors.spec[2] * specular * 0.6;

    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();

    ctx.fillStyle = `rgb(${clamp(sr*255)},${clamp(sg*255)},${clamp(sb*255)})`;
    ctx.fill();

    // Facet edge — 0.5px stroke defines the polyhedron shape
    ctx.strokeStyle = `rgb(${clamp(colors.stroke[0]*255)},${clamp(colors.stroke[1]*255)},${clamp(colors.stroke[2]*255)})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  return canvas;
}

function clamp(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)));
}

export interface GoldSpotScreenPos {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

/**
 * Draw golden icosahedrons at all gold spot positions on the game canvas.
 *
 * 3D math runs exactly once per frame. The rendered icosahedron is
 * drawImage'd at each gold spot position — constant cost per spot.
 */
export function drawGoldIcosahedrons(
  ctx: CanvasRenderingContext2D,
  goldSpots: GoldSpotScreenPos[],
  timeMs: number,
  icoSize = 40,
): void {
  if (goldSpots.length === 0) return;

  // ONE call to the 3D math — reused for every gold spot
  const icoCanvas = renderIcosahedron(timeMs, icoSize);

  for (const spot of goldSpots) {
    const cx = Math.round(spot.screenX);
    const cy = Math.round(spot.screenY);
    ctx.drawImage(icoCanvas, cx - icoSize / 2, cy - icoSize / 2);
  }
}
