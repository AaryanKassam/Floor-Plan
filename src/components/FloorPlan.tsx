"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import Floor from "./Floor";
import { floorSpec } from "@/lib/floors";
import { COMBINE_DWELL_MS, combinedPosition, findCombineTarget, findFreeSpot } from "@/lib/layout";
import type { Box, CombineTarget } from "@/lib/layout";
import type { BookingRec, RoomRec, TableRec } from "@/lib/types";

const VW = 1000;

interface Props {
  room: RoomRec;
  tables: TableRec[];
  occupancy: Map<number, BookingRec>;
  /** Tables with another booking that day: "soon" within an hour, else "later". */
  dayMarks: Map<number, "soon" | "later">;
  focusedId: number | null;
  onFocus: (id: number | null) => void;
  editing?: boolean;
  onChange?: (updates: { id: number; x: number; y: number; group: number | null }[]) => void;
  onContextMenu?: (id: number, clientX: number, clientY: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The camera is the viewBox, not a CSS transform on a group.
 *
 * A transform would be ambiguous: `transform-box` defaults to the group's
 * bounding box, and the floor planks deliberately extend past the viewBox, so
 * the origin landed off-canvas and the room flew off-screen. Animating the
 * viewBox is defined purely in user units, so the framing is exact.
 */
function frame(table: TableRec | null, vh: number) {
  if (!table) return { x: 0, y: 0, w: VW, h: vh };

  const cx = table.x * VW;
  const cy = table.y * vh;
  const rw = Math.max(table.w * VW, 26);
  const rh = Math.max(table.h * vh, 26);

  // Fill roughly a third of the frame with the table, bounded so tiny tables
  // do not zoom absurdly close and large ones still visibly enlarge.
  const scale = clamp(Math.min(VW / (rw * 3.2), vh / (rh * 3.2)), 1.9, 6.5);
  const w = VW / scale;
  const h = vh / scale;

  // Sit the table above centre; the detail panel occupies the lower third.
  // A small overshoot past the room edge is allowed so tables near a wall
  // still centre properly, rather than being shoved to one side.
  return {
    x: clamp(cx - w / 2, -w * 0.3, VW - w * 0.7),
    y: clamp(cy - h * 0.38, -h * 0.3, vh - h * 0.7),
    w,
    h,
  };
}

export default function FloorPlan({
  room,
  tables,
  occupancy,
  dayMarks,
  focusedId,
  onFocus,
  editing = false,
  onChange,
  onContextMenu,
}: Props) {
  const reduce = useReducedMotion();
  const VH = Math.round((VW * room.image_h) / (room.image_w || 1000));
  const spec = floorSpec(room.floor);

  const focused = editing ? null : (tables.find((t) => t.id === focusedId) ?? null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [combine, setCombine] = useState<CombineTarget | null>(null);
  // Combining only arms after the pair has been held together for a moment,
  // so brushing past a table never offers to join it.
  const [armed, setArmed] = useState(false);
  const dwell = useRef<{ id: number | null; timer: ReturnType<typeof setTimeout> | null }>({
    id: null,
    timer: null,
  });
  const grabOffset = useRef({ dx: 0, dy: 0 });

  function resetDwell() {
    if (dwell.current.timer) clearTimeout(dwell.current.timer);
    dwell.current = { id: null, timer: null };
    setArmed(false);
  }

  useEffect(() => () => resetDwell(), []);

  const toBox = (t: TableRec, at?: { x: number; y: number }): Box => ({
    id: t.id,
    x: at?.x ?? t.x,
    y: at?.y ?? t.y,
    w: t.w,
    h: t.h,
    group: t.group_id,
  });

  /** Screen pixels -> normalised 0..1, via the SVG's own matrix so viewBox and
   *  letterboxing are accounted for automatically. */
  function toNormalised(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x / VW, y: p.y / VH };
  }

  const vx = useMotionValue(0);
  const vy = useMotionValue(0);
  const vw = useMotionValue(VW);
  const vh = useMotionValue(VH);
  const viewBox = useMotionTemplate`${vx} ${vy} ${vw} ${vh}`;

  useEffect(() => {
    const target = frame(focused, VH);
    // Entrances ease out and run a little longer; the exit is quicker.
    const opts = reduce
      ? { duration: 0 }
      : focused
        ? { duration: 0.62, ease: [0.22, 0.61, 0.36, 1] as const }
        : { duration: 0.44, ease: [0.4, 0, 0.2, 1] as const };

    const runs = [
      animate(vx, target.x, opts),
      animate(vy, target.y, opts),
      animate(vw, target.w, opts),
      animate(vh, target.h, opts),
    ];
    return () => runs.forEach((r) => r.stop());
  }, [focused, VH, reduce, vx, vy, vw, vh]);

  return (
    <motion.svg
      ref={svgRef}
      viewBox={viewBox}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${room.name} floor plan`}
      onClick={() => !editing && onFocus(null)}
      style={{ touchAction: editing ? "none" : undefined }}
    >
      <defs>
        {/* Planks start off-canvas so butt joints stagger; keep them inside
            the room rectangle. */}
        <clipPath id={`room-${room.id}`}>
          <rect x={0} y={0} width={VW} height={VH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#room-${room.id})`}>
        <Floor floorId={room.floor} vw={VW} vh={VH} uid={`r${room.id}`} />

        {room.image_path && (
          <image
            href={room.image_path}
            x={0}
            y={0}
            width={VW}
            height={VH}
            preserveAspectRatio="none"
            opacity={0.42}
            style={{ mixBlendMode: "multiply" }}
          />
        )}

        {tables.map((t) => {
          const live = dragId === t.id && ghost ? ghost : t;
          const cx = live.x * VW;
          const cy = live.y * VH;
          const rw = Math.max(t.w * VW, 26);
          const rh = Math.max(t.h * VH, 26);
          const booking = occupancy.get(t.id);
          const booked = Boolean(booking);
          const isFocused = focusedId === t.id;
          const dimmed = focusedId !== null && !isFocused;

          return (
            <motion.g
              key={t.id}
              className={`table-hit${isFocused ? " is-zoomed" : ""}${
                dragId === t.id ? " is-dragging" : ""
              }`}
              animate={{ opacity: dimmed ? 0 : 1 }}
              initial={false}
              transition={reduce ? { duration: 0 } : { duration: 0.34, ease: "easeOut" }}
              style={{
                pointerEvents: dimmed ? "none" : "auto",
                cursor: editing ? (dragId === t.id ? "grabbing" : "grab") : "pointer",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (editing) return;
                onFocus(isFocused ? null : t.id);
              }}
              onPointerDown={(e) => {
                // Primary button only. A right click also fires pointerdown/up,
                // which previously ran the whole drop path and silently cleared
                // the table's group the moment you opened the context menu.
                if (!editing || e.button !== 0) return;
                e.stopPropagation();
                const p = toNormalised(e.clientX, e.clientY);
                if (!p) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                grabOffset.current = { dx: t.x - p.x, dy: t.y - p.y };
                setDragId(t.id);
                setGhost({ x: t.x, y: t.y });
              }}
              onPointerMove={(e) => {
                if (!editing || dragId !== t.id) return;
                const p = toNormalised(e.clientX, e.clientY);
                if (!p) return;
                const next = { x: p.x + grabOffset.current.dx, y: p.y + grabOffset.current.dy };
                setGhost(next);
                const cand = findCombineTarget(
                  toBox(t, next),
                  tables.filter((o) => o.id !== t.id).map((o) => toBox(o))
                );
                setCombine(cand);

                // Restart the hold timer whenever the candidate changes.
                const candId = cand?.target.id ?? null;
                if (candId !== dwell.current.id) {
                  if (dwell.current.timer) clearTimeout(dwell.current.timer);
                  setArmed(false);
                  dwell.current = {
                    id: candId,
                    timer:
                      candId == null
                        ? null
                        : setTimeout(() => setArmed(true), COMBINE_DWELL_MS),
                  };
                }
              }}
              onPointerUp={(e) => {
                if (!editing || e.button !== 0 || dragId !== t.id) return;
                e.currentTarget.releasePointerCapture(e.pointerId);
                const dropped = ghost ?? { x: t.x, y: t.y };
                const others = tables.filter((o) => o.id !== t.id).map((o) => toBox(o));

                if (combine && armed) {
                  // Join: sit flush, share a group so they may keep touching.
                  const pos = combinedPosition(toBox(t, dropped), combine);
                  const group =
                    combine.target.group ??
                    Math.max(0, ...tables.map((o) => o.group_id ?? 0)) + 1;
                  const updates = [{ id: t.id, x: pos.x, y: pos.y, group }];
                  if (combine.target.group == null) {
                    const tgt = tables.find((o) => o.id === combine.target.id)!;
                    updates.push({ id: tgt.id, x: tgt.x, y: tgt.y, group });
                  }
                  setDragId(null);
                  setGhost(null);
                  setCombine(null);
                  resetDwell();
                  onChange?.(updates);
                  return;
                }

                // Never leave two tables stacked: settle into the nearest gap.
                // Dragging a table out on its own also leaves its group.
                const spot = findFreeSpot(toBox({ ...t, group_id: null }, dropped), others, VW, VH);
                setDragId(null);
                setGhost(null);
                setCombine(null);
                resetDwell();
                onChange?.([{ id: t.id, x: spot.x, y: spot.y, group: null }]);
              }}
              onPointerCancel={() => {
                setDragId(null);
                setGhost(null);
                setCombine(null);
                resetDwell();
              }}
              onContextMenu={(e) => {
                if (!editing || !onContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(t.id, e.clientX, e.clientY);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Table ${t.number}, seats ${t.seats}, ${
                booked
                  ? "booked"
                  : dayMarks.has(t.id)
                    ? `free now, booked ${dayMarks.get(t.id) === "soon" ? "within the hour" : "later today"}`
                    : "free"
              }`}
              onKeyDown={(e) => {
                if (editing) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFocus(isFocused ? null : t.id);
                }
              }}
            >
              {t.shape === "round" ? (
                <ellipse
                  className="table-shape"
                  cx={cx}
                  cy={cy}
                  rx={rw / 2}
                  ry={rh / 2}
                  fill={booked ? "var(--seat-booked)" : "var(--seat-free)"}
                  stroke="var(--seat-edge)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <rect
                  className="table-shape"
                  x={cx - rw / 2}
                  y={cy - rh / 2}
                  width={rw}
                  height={rh}
                  rx={t.shape === "bar" ? Math.min(rh / 2, 8) : 2}
                  fill={booked ? "var(--seat-booked)" : "var(--seat-free)"}
                  stroke="var(--seat-edge)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}

              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(rh * 0.44, 20)}
                fontWeight={600}
                fill="#F6F1E8"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {t.number}
              </text>

              {!focused && (() => {
                const mark = booked ? undefined : dayMarks.get(t.id);
                // Offset the seat count so the marker sits beside it rather
                // than over it; digits are about 8.4px wide at this size.
                const half = (String(t.seats).length * 8.4) / 2;
                const shift = mark ? 6 : 0;
                return (
                  <g style={{ pointerEvents: "none", userSelect: "none" }}>
                    <text
                      x={cx - shift}
                      y={cy + rh / 2 + 13}
                      textAnchor="middle"
                      fontSize={14}
                      fontWeight={700}
                      fill={spec.ink}
                    >
                      {t.seats}
                    </text>
                    {mark && (
                      <circle
                        cx={cx - shift + half + 7}
                        cy={cy + rh / 2 + 9}
                        r={3.6}
                        fill={mark === "soon" ? "var(--dot-soon)" : "var(--dot-later)"}
                        stroke="#17140F"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </g>
                );
              })()}

              {booked && !dimmed && (
                <g style={{ pointerEvents: "none" }}>
                  <circle
                    cx={cx + rw / 2 - 1}
                    cy={cy - rh / 2 + 1}
                    r={7.5}
                    fill="var(--panel)"
                    stroke="var(--seat-booked)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={cx + rw / 2 - 1}
                    y={cy - rh / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={700}
                    fill="var(--seat-booked)"
                  >
                    i
                  </text>
                </g>
              )}
            </motion.g>
          );
        })}
        {/* Combine hint: a chevron pointing at the target, plus a translucent
            pill. Drawn last so it sits above every table. */}
        {editing && combine && armed && ghost && dragId !== null && (() => {
          const moving = tables.find((t) => t.id === dragId);
          if (!moving) return null;
          const tgt = combine.target;
          const dir = combine.side === "right" ? -1 : 1; // points from moving -> target
          const midX = ((ghost.x + tgt.x) / 2) * VW;
          const midY = ((ghost.y + tgt.y) / 2) * VH;
          const arrowY = midY;
          const a = 9;
          return (
            <g style={{ pointerEvents: "none" }}>
              <polygon
                points={`${midX + dir * a},${arrowY} ${midX - dir * a * 0.4},${arrowY - a * 0.8} ${midX - dir * a * 0.4},${arrowY + a * 0.8}`}
                fill="var(--brass)"
              />
              <g transform={`translate(${midX}, ${midY - Math.max(moving.h, tgt.h) * VH * 0.5 - 18})`}>
                <rect x={-38} y={-13} width={76} height={26} rx={3} fill="#17140F" opacity={0.72} />
                <text
                  x={0}
                  y={1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13}
                  fontWeight={700}
                  fill="#F7F2E9"
                >
                  Combine
                </text>
              </g>
            </g>
          );
        })()}
      </g>
    </motion.svg>
  );
}
