"use client";

import type { RoomRec } from "@/lib/types";

interface Props {
  rooms: RoomRec[];
  index: number;
  onChange: (i: number) => void;
}

/** Room name above a dot control. Hidden entirely for a single-room venue. */
export default function RoomDots({ rooms, index, onChange }: Props) {
  if (rooms.length < 2) return null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
        {rooms[index]?.name}
        {rooms[index]?.is_outdoor ? " · outdoor" : ""}
      </span>
      <div className="flex items-center gap-2">
        {rooms.map((r, i) => {
          // Outdoor rooms are tinted green, mirroring how weekend dates are
          // tinted cream, so the kind of room is readable at a glance.
          const outdoor = Boolean(r.is_outdoor);
          const active = i === index;
          const accent = outdoor ? "var(--outdoor)" : "var(--brass)";
          return (
            <button
              key={r.id}
              onClick={() => onChange(i)}
              aria-label={`Show ${r.name}${outdoor ? ", outdoor" : ""}`}
              aria-current={active}
              className="grid h-6 w-6 place-items-center"
            >
              <span
                className="block h-2.5 w-2.5 rounded-full border"
                style={{
                  background: active ? accent : outdoor ? "var(--outdoor-dim)" : "transparent",
                  borderColor: active || outdoor ? accent : "var(--line-strong)",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
