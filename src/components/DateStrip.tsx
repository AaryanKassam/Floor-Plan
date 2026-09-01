"use client";

import { addDays, dayOfMonth, isWeekend, weekdayShort } from "@/lib/time";

interface Props {
  date: string;
  /** "before" renders the previous three days, "after" the next three. */
  side: "before" | "after";
  onPick: (iso: string) => void;
}

/**
 * Three day chips either side of the centre bar. Ordering puts the day nearest
 * the selected date closest to the bar, so the strip reads as one timeline:
 *   17 18 19 [ 20 ] 21 22 23
 */
export default function DateStrip({ date, side, onPick }: Props) {
  const offsets = side === "before" ? [-3, -2, -1] : [1, 2, 3];

  return (
    <div className="hidden items-center gap-2 lg:flex">
      {offsets.map((n) => {
        const iso = addDays(date, n);
        const weekend = isWeekend(iso);

        return (
          <button
            key={n}
            onClick={() => onPick(iso)}
            aria-label={`Show ${weekdayShort(iso)} ${dayOfMonth(iso)}`}
            className="grid h-[52px] w-[52px] shrink-0 place-items-center border leading-none"
            style={{
              borderRadius: "var(--radius)",
              // Weekends read as cream so they stand out from the weekday chips.
              background: weekend ? "#E8DFC9" : "var(--panel)",
              borderColor: weekend ? "#E8DFC9" : "var(--line-strong)",
              color: weekend ? "#241F17" : "var(--ink)",
            }}
          >
            <span className="text-[17px] font-bold">{dayOfMonth(iso)}</span>
            <span
              className="mt-0.5 text-[9px] font-semibold tracking-[0.08em]"
              style={{ color: weekend ? "#5C5344" : "var(--ink-muted)" }}
            >
              {weekdayShort(iso)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
