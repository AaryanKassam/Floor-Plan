"use client";

import { motion } from "motion/react";
import { label12h } from "@/lib/time";
import type { BookingRec, TableRec } from "@/lib/types";

interface Props {
  date: string;
  bookings: BookingRec[];
  tables: TableRec[];
  sheetsConfigured: boolean;
  onChanged: () => void;
  onClose: () => void;
}

export default function InfoPanel({
  date,
  bookings,
  tables,
  sheetsConfigured,
  onChanged,
  onClose,
}: Props) {
  const tableNumber = (id: number) => tables.find((t) => t.id === id)?.number ?? "?";

  async function cancel(id: number) {
    await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
      className="pointer-events-auto flex max-h-full w-[330px] flex-col border border-[var(--line-strong)] bg-[var(--panel)]"
      aria-label="Bookings and settings"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
        <h2 className="display text-xl">Bookings</h2>
        <button onClick={onClose} className="btn px-2 py-1 text-sm">Hide</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="label">{date}</p>
        {bookings.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Nothing booked for this date.</p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="border border-[var(--line)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.name}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {label12h(b.start_min)}, {b.party_size} guests, table {tableNumber(b.table_id)}
                    </p>
                    {sheetsConfigured && !b.sheet_synced && (
                      <p className="mt-0.5 text-xs text-[#D9A441]">Not synced to sheet</p>
                    )}
                  </div>
                  <button onClick={() => cancel(b.id)} className="btn px-2 py-1 text-xs">
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

      </div>

      <div className="border-t border-[var(--line)] p-3 text-xs text-[var(--ink-muted)]">
        <a href="/terms" className="underline">Terms</a>
        <span> and </span>
        <a href="/privacy" className="underline">Privacy</a>
      </div>
    </motion.aside>
  );
}
