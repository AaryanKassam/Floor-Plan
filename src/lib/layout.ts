/**
 * Layout geometry for edit mode. Pure functions, no React, no DOM.
 *
 * All coordinates are the same normalised 0..1 space the database uses, with
 * x/y being the table CENTRE.
 */

export interface Box {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Combined tables share a group and are allowed to sit flush. */
  group?: number | null;
}

/**
 * Breathing room between tables, in normalised units.
 *
 * The vertical gap is much larger than the horizontal one on purpose: each
 * table draws its seat count roughly 27 viewBox units BELOW its shape, so two
 * tables can have non-overlapping shapes and still collide visually when the
 * upper one's label lands on the lower one. Shape-only spacing looked correct
 * in isolation and wrong on screen.
 */
export const DEFAULT_GAP = { x: 0.014, y: 0.048 };

export interface Gap {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Axis-aligned overlap test, treating every shape as its bounding box. */
export function overlaps(a: Box, b: Box, gap: Gap = DEFAULT_GAP): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap.x &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap.y
  );
}

export function isFree(candidate: Box, others: Box[], gap: Gap = DEFAULT_GAP): boolean {
  return !others.some(
    (o) => o.id !== candidate.id && !sameGroup(candidate, o) && overlaps(candidate, o, gap)
  );
}

/** Keep a table fully inside the room. */
export function clampInside(b: Box): { x: number; y: number } {
  return {
    x: clamp(b.x, b.w / 2, 1 - b.w / 2),
    y: clamp(b.y, b.h / 2, 1 - b.h / 2),
  };
}

/**
 * Nearest position to the drop point where the table does not touch any other.
 *
 * Searches outward in rings. The ring offsets are computed in VIEWBOX units and
 * then converted back, so the search is visually circular; stepping in
 * normalised units would bias it along whichever axis is shorter.
 * Returns the clamped drop point if the room is too full to fit anywhere.
 */
export function findFreeSpot(
  candidate: Box,
  others: Box[],
  vw: number,
  vh: number,
  gap: Gap = DEFAULT_GAP
): { x: number; y: number } {
  const start = clampInside(candidate);
  if (isFree({ ...candidate, ...start }, others, gap)) return start;

  const step = 6; // viewBox units per ring
  const maxR = Math.max(vw, vh);

  for (let r = step; r <= maxR; r += step) {
    const count = Math.max(12, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const probe = clampInside({
        ...candidate,
        x: candidate.x + (r * Math.cos(angle)) / vw,
        y: candidate.y + (r * Math.sin(angle)) / vh,
      });
      if (isFree({ ...candidate, ...probe }, others, gap)) return probe;
    }
  }
  return start;
}

/* ---------- Combining tables ---------- */

/**
 * Combining is HORIZONTAL only, on purpose. Each table draws its seat count
 * below its shape, so two tables stacked flush vertically would put the upper
 * one's label on top of the lower one. Side-by-side also matches how a
 * restaurant actually joins tables into a run.
 */
export interface CombineTarget {
  target: Box;
  side: "left" | "right";
  gap: number;
}

/**
 * How close the edges must be before combining is offered. Deliberately tiny:
 * the tables must be touching, not merely near each other. A generous reach
 * made the prompt fire constantly while simply moving a table past another.
 */
const COMBINE_REACH = 0.006;

/** The pair must also be held together this long before combining arms. */
export const COMBINE_DWELL_MS = 2000;
/** How closely the vertical centres must line up, as a fraction of height. */
const ALIGN_TOLERANCE = 0.6;
/** Seam left between combined tables so both borders stay visible. */
const SEAM = 0.002;

export function sameGroup(a: Box, b: Box): boolean {
  return a.group != null && a.group === b.group;
}

/** The table this one would combine with if dropped now, or null. */
export function findCombineTarget(moving: Box, others: Box[]): CombineTarget | null {
  let best: CombineTarget | null = null;

  for (const o of others) {
    if (o.id === moving.id) continue;

    // Must be roughly in line vertically, or it is not a side-by-side join.
    if (Math.abs(moving.y - o.y) > ((moving.h + o.h) / 2) * ALIGN_TOLERANCE) continue;

    const dx = moving.x - o.x;
    const edgeGap = Math.abs(dx) - (moving.w + o.w) / 2;

    if (edgeGap > COMBINE_REACH) continue;
    // Dropped almost entirely on top of it: that is a move, not a join.
    if (edgeGap < -Math.min(moving.w, o.w) * 0.55) continue;

    if (!best || edgeGap < best.gap) {
      best = { target: o, side: dx >= 0 ? "right" : "left", gap: edgeGap };
    }
  }
  return best;
}

/** Flush position for `moving` against its combine target. */
export function combinedPosition(moving: Box, t: CombineTarget): { x: number; y: number } {
  const dir = t.side === "right" ? 1 : -1;
  return clampInside({
    ...moving,
    x: t.target.x + dir * ((t.target.w + moving.w) / 2 + SEAM),
    y: t.target.y,
  });
}
