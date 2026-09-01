import type { FloorId } from "./types";

/**
 * Floor material recipes.
 *
 * Realism here comes from three stacked cues, not from a single texture:
 *   1. planks of VARYING length with staggered butt joints (a uniform grid
 *      instantly reads as fake),
 *   2. per-plank lightness jitter, since no two boards are the same tone,
 *   3. an feTurbulence grain overlay stretched along the plank direction.
 * All of it is procedural SVG, so there are no texture images to ship.
 */
export interface FloorSpec {
  id: FloorId;
  label: string;
  base: string;
  /** Per-plank lightness jitter, in +/- percent. */
  jitter: number;
  /** Colour of the butt joints and plank seams. */
  seam: string;
  /** Opacity of the turbulence grain overlay, 0..1. */
  grain: number;
  /** Grain tint, applied as the overlay colour. */
  grainColor: string;
  /** Horizontal / vertical turbulence frequency. Low x + high y = long grain. */
  freq: [number, number];
  rows: number;
  planks: boolean;
  /** Near-black or near-white, whichever reads on this floor. Used for the
   *  seat-count labels drawn directly on the boards. */
  ink: string;
}

export const FLOORS: FloorSpec[] = [
  {
    id: "white-oak",
    label: "White Oak",
    base: "#C6A87C",
    jitter: 5,
    seam: "#8E7350",
    grain: 0.3,
    grainColor: "#6B5433",
    freq: [0.004, 0.13],
    rows: 13,
    planks: true,
    ink: "#141210",
  },
  {
    id: "walnut",
    label: "Walnut",
    base: "#6B4A32",
    jitter: 6,
    seam: "#3F2A1B",
    grain: 0.34,
    grainColor: "#2A1B10",
    freq: [0.005, 0.11],
    rows: 12,
    planks: true,
    ink: "#F7F2E9",
  },
  {
    id: "smoked-ash",
    label: "Smoked Ash",
    base: "#94897A",
    jitter: 5,
    seam: "#645B4F",
    grain: 0.28,
    grainColor: "#3D372F",
    freq: [0.004, 0.15],
    rows: 14,
    planks: true,
    ink: "#141210",
  },
  {
    id: "reclaimed-chestnut",
    label: "Reclaimed Chestnut",
    base: "#9A6642",
    jitter: 9,
    seam: "#5E3A22",
    grain: 0.4,
    grainColor: "#412715",
    freq: [0.006, 0.1],
    rows: 11,
    planks: true,
    ink: "#F7F2E9",
  },
  {
    id: "ebonised-oak",
    label: "Ebonised Oak",
    base: "#332E29",
    jitter: 7,
    seam: "#1C1917",
    grain: 0.36,
    grainColor: "#0E0C0A",
    freq: [0.005, 0.12],
    rows: 12,
    planks: true,
    ink: "#F7F2E9",
  },
  {
    id: "poured-concrete",
    label: "Poured Concrete",
    base: "#8D8880",
    jitter: 2,
    seam: "#6E6961",
    grain: 0.22,
    grainColor: "#4A463F",
    freq: [0.02, 0.02],
    rows: 4,
    planks: false,
    ink: "#141210",
  },
];

export function floorSpec(id: string): FloorSpec {
  return FLOORS.find((f) => f.id === id) ?? FLOORS[0];
}

/** Deterministic pseudo-random in [0,1) so a floor renders identically each time. */
export function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Lighten or darken a hex colour by `pct` percent. */
export function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = 1 + pct / 100;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).padStart(6, "0")}`;
}

/**
 * Build the plank rectangles for one room.
 * Butt joints are offset per row so seams never line up into a visible grid.
 */
export function buildPlanks(spec: FloorSpec, vw: number, vh: number) {
  const out: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  if (!spec.planks) return out;

  const rowH = vh / spec.rows;

  for (let row = 0; row < spec.rows; row++) {
    // Each row starts at a different offset, so end joints stagger.
    let x = -seeded(row * 3.1) * vw * 0.45;
    let i = 0;
    while (x < vw) {
      const len = vw * (0.28 + seeded(row * 7.7 + i * 2.3) * 0.42);
      const tone = (seeded(row * 5.3 + i * 9.1) - 0.5) * 2 * spec.jitter;
      out.push({
        x,
        y: row * rowH,
        w: len,
        h: rowH,
        fill: shade(spec.base, tone),
      });
      x += len;
      i++;
    }
  }
  return out;
}
