/**
 * Icosahedron Renderer
 *
 * Renders a rotating 3D icosahedron with a warm glow behind it and
 * gently shaded faces. One offscreen canvas per frame, drawImage'd
 * at every gold spot position.
 */

const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSA_VERTICES: [number, number, number][] = [
  [ 0,  1,  PHI], [ 0, -1,  PHI], [ 0,  1, -PHI], [ 0, -1, -PHI],
  [ 1,  PHI,  0], [-1,  PHI,  0], [ 1, -PHI,  0], [-1, -PHI,  0],
  [ PHI, 0,  1], [-PHI, 0,  1], [ PHI, 0, -1], [-PHI, 0, -1],
];

const ICOSA_FACES: [number, number, number][] = [
  [0, 1, 8],  [0, 8, 4],  [0, 4, 5],   [0, 5, 9],   [0, 9, 1],
  [1, 6, 8],  [8, 10, 4], [4, 2, 5],   [5, 11, 9],  [9, 7, 1],
  [1, 7, 6],  [8, 6, 10], [4, 10, 2],  [5, 2, 11],  [9, 11, 7],
  [3, 6, 7],  [3, 10, 6],[3, 2, 10],  [3, 11, 2],  [3, 7, 11],
];

const LIGHT = normalize([0.8, 0.8, 0.5]);
const HALF_VEC = normalize([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

// ── Vector Math ──

function normalize(v: number[]): number[] {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return [v[0]/len, v[1]/len, v[2]/len];
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
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

// ── Palette ──

export interface Palette {
  glowColor: [number, number, number];
  fill:      [number, number, number];
  shaded:    [number, number, number];
  spec:      [number, number, number];
  stroke:    [number, number, number];
}

type PaletteName = 'gold' | 'emerald' | 'amethyst';

const PALETTES: Record<PaletteName, Palette> = {
  gold: {
    glowColor: [1.0,  0.50, 0.0],
    fill:      [0.95, 0.65, 0.10],
    shaded:    [0.65, 0.40, 0.05],
    spec:      [1.0,  0.90, 0.50],
    stroke:    [0.95, 0.70, 0.15],
  },
  emerald: {
    glowColor: [0.05, 0.60, 0.15],
    fill:      [0.15, 0.85, 0.30],
    shaded:    [0.08, 0.60, 0.18],
    spec:      [0.70, 1.0,  0.80],
    stroke:    [0.25, 0.95, 0.45],
  },
  amethyst: {
    glowColor: [0.55, 0.15, 0.60],
    fill:      [0.80, 0.30, 0.90],
    shaded:    [0.55, 0.18, 0.65],
    spec:      [0.90, 0.65, 1.0],
    stroke:    [0.90, 0.40, 1.0],
  },
};

// ── Renderer ──

let _offscreenCanvas: HTMLCanvasElement | null = null;
let _lastSize = 0;

/* ── Pre-built glow gradient cache per size ── */
const _glowCache = new Map<number, { cx: number; cy: number; r: number }>();

function getGlowGeometry(size: number): { cx: number; cy: number; r: number } {
  let g = _glowCache.get(size);
  if (!g) {
    g = { cx: size / 2, cy: size / 2, r: size * 0.48 };
    _glowCache.set(size, g);
  }
  return g;
}

export function renderIcosahedron(
  timeMs: number,
  size = 48,
  palette: PaletteName = 'gold',
  rotSpeed = 1.5
): HTMLCanvasElement {
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

  // Rotate + project
  const rotated = ICOSA_VERTICES.map(v => rotateY(v, angle));
  const scale = size * 0.35;
  const projected = rotated.map(v => [
    v[0] * scale + size / 2,
    -v[1] * scale + size / 2,
    v[2],
  ]);

  // Build faces
  interface FaceData { i0: number; i1: number; i2: number; normal: number[]; centerZ: number; }
  const faceData: FaceData[] = ICOSA_FACES.map(([i0, i1, i2]) => {
    const a = rotated[i0], b = rotated[i1], c = rotated[i2];
    const normal = computeFaceNormal(a, b, c);
    const centerZ = (projected[i0][2] + projected[i1][2] + projected[i2][2]) / 3;
    return { i0, i1, i2, normal, centerZ };
  });

  const visibleFaces = faceData.filter(f => f.normal[2] < 0).sort((a, b) => a.centerZ - b.centerZ);

  // Warm glow behind the whole icosahedron — use pre-cached geometry (fixed per size)
  const geo = getGlowGeometry(size);
  const glow = ctx.createRadialGradient(geo.cx, geo.cy, 0, geo.cx, geo.cy, geo.r);
  const gc = colors.glowColor;
  glow.addColorStop(0, `rgba(${clamp(gc[0]*255)},${clamp(gc[1]*255)},${clamp(gc[2]*255)},0.85)`);
  glow.addColorStop(0.4, `rgba(${clamp(gc[0]*255)},${clamp(gc[1]*255)},${clamp(gc[2]*255)},0.45)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r, 0, Math.PI * 2);
  ctx.fill();

  // Draw each face — warm, gently lit, with specular highlight
  for (const face of visibleFaces) {
    const p0 = projected[face.i0];
    const p1 = projected[face.i1];
    const p2 = projected[face.i2];

    // Gentle lighting: 0.6–1.0 range so faces never go dark
    const diffuse = 0.6 + 0.4 * Math.max(0, dot(face.normal, LIGHT));
    const specular = Math.pow(Math.max(0, dot(face.normal, HALF_VEC)), 32);

    const r = (colors.fill[0] * diffuse + colors.spec[0] * specular * 0.5) * 255;
    const g = (colors.fill[1] * diffuse + colors.spec[1] * specular * 0.5) * 255;
    const b = (colors.fill[2] * diffuse + colors.spec[2] * specular * 0.5) * 255;

    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
    ctx.fill();

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

/** Octahedron Renderer — for the player model */
const OCTA_VERTICES: [number, number, number][] = [
  [ 0,  1,  0],  // 0 — top
  [ 0, -1,  0],  // 1 — bottom
  [ 1,  0,  0],  // 2 — right
  [ 0,  0,  1],  // 3 — front
  [-1,  0,  0],  // 4 — left
  [ 0,  0, -1],  // 5 — back
];

const OCTA_FACES: [number, number, number][] = [
  // Top cap — connecting vertex 0 (top) with equatorial pairs
  [0, 2, 3],  // top, right, front
  [0, 3, 4],  // top, front, left
  [0, 4, 5],  // top, left, back
  [0, 5, 2],  // top, back, right
  // Bottom cap — connecting vertex 1 (bottom) with equatorial pairs
  [1, 3, 2],  // bottom, front, right
  [1, 4, 3],  // bottom, left, front
  [1, 5, 4],  // bottom, back, left
  [1, 2, 5],  // bottom, right, back
];

const PLAYER_PALETTE: Palette = {
  glowColor: [0.1, 0.35, 0.85],
  fill:      [0.23, 0.50, 0.95],
  shaded:    [0.12, 0.30, 0.60],
  spec:      [0.70, 0.85, 1.0],
  stroke:    [0.50, 0.75, 1.0],
};

/** Lime green palette for other players on the grid */
export const PLAYER_PALETTE_LIME: Palette = {
  glowColor: [0.30, 0.85, 0.15],
  fill:      [0.50, 0.95, 0.30],
  shaded:    [0.25, 0.60, 0.12],
  spec:      [0.85, 1.0,  0.70],
  stroke:    [0.55, 1.0,  0.35],
};

/* ── Cached octahedron canvas (module-level, avoid GC pressure) ── */
let _octaCanvas: HTMLCanvasElement | null = null;
let _octaSize = 0;

export function renderOctahedron(
  timeMs: number,
  size = 48,
  rotSpeed = 1.5,
  palette?: Palette
): HTMLCanvasElement {
  if (!_octaCanvas || _octaSize !== size) {
    _octaCanvas = document.createElement('canvas');
    _octaCanvas.width = size;
    _octaCanvas.height = size;
    _octaSize = size;
  }
  const canvas = _octaCanvas;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const colors = palette ?? PLAYER_PALETTE;
  const angle = (timeMs / 1000) * rotSpeed;

  // Blinn-Phong tuned for octahedron's [0,2,3] face (top-right from POV on screen).
  // Face normal at rest = (-1/√3, -1/√3, -1/√3). Solving halfvec = normal with
  // view=(0,0,-1) gives light = normalize(-2/3, -2/3, 1/3) = (-0.667, -0.667, 0.333).
  // This puts the strongest specular on the top-right face. As it rotates, adjacent
  // faces will carry the highlight through the same screen region.
  const LIGHT_OCTA = normalize([-2/3, -2/3, 1/3]);
  const light = LIGHT_OCTA;
  const halfVec = normalize([light[0], light[1], light[2] - 1]);

  const rotated = OCTA_VERTICES.map(v => rotateY(v, angle));
  const scale = size * 0.40;
  const projected = rotated.map(v => [
    v[0] * scale + size / 2,
    -v[1] * scale + size / 2,
    v[2],
  ]);

  interface FaceData { i0: number; i1: number; i2: number; normal: number[]; centerZ: number; }
  const faceData: FaceData[] = OCTA_FACES.map(([i0, i1, i2]) => {
    const a = rotated[i0], b = rotated[i1], c = rotated[i2];
    const normal = computeFaceNormal(a, b, c);
    const centerZ = (projected[i0][2] + projected[i1][2] + projected[i2][2]) / 3;
    return { i0, i1, i2, normal, centerZ };
  });

  const visibleFaces = faceData.filter(f => f.normal[2] < 0).sort((a, b) => a.centerZ - b.centerZ);

  // Glow behind octahedron — use cached geometry
  const geo = getGlowGeometry(size);
  const glow = ctx.createRadialGradient(geo.cx, geo.cy, 0, geo.cx, geo.cy, geo.r);
  const gc = colors.glowColor;
  glow.addColorStop(0, `rgba(${clamp(gc[0]*255)},${clamp(gc[1]*255)},${clamp(gc[2]*255)},0.80)`);
  glow.addColorStop(0.4, `rgba(${clamp(gc[0]*255)},${clamp(gc[1]*255)},${clamp(gc[2]*255)},0.35)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r, 0, Math.PI * 2);
  ctx.fill();

  // Draw each face with Blinn-Phong — same technique as the icosahedron
  for (const face of visibleFaces) {
    const p0 = projected[face.i0];
    const p1 = projected[face.i1];
    const p2 = projected[face.i2];

    const diffuse = 0.5 + 0.5 * Math.max(0, dot(face.normal, light));
    const specular = Math.pow(Math.max(0, dot(face.normal, halfVec)), 32);

    const r = (colors.fill[0] * diffuse + colors.spec[0] * specular * 0.5) * 255;
    const g = (colors.fill[1] * diffuse + colors.spec[1] * specular * 0.5) * 255;
    const b = (colors.fill[2] * diffuse + colors.spec[2] * specular * 0.5) * 255;

    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
    ctx.fill();

    ctx.strokeStyle = `rgb(${clamp(colors.stroke[0]*255)},${clamp(colors.stroke[1]*255)},${clamp(colors.stroke[2]*255)})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  return canvas;
}

export function drawGoldIcosahedrons(
  ctx: CanvasRenderingContext2D,
  goldSpots: GoldSpotScreenPos[],
  timeMs: number,
  icoSize = 40,
): void {
  if (goldSpots.length === 0) return;
  const icoCanvas = renderIcosahedron(timeMs, icoSize);
  for (const spot of goldSpots) {
    const cx = Math.round(spot.screenX);
    const cy = Math.round(spot.screenY);
    ctx.drawImage(icoCanvas, cx - icoSize / 2, cy - icoSize / 2);
  }
}
