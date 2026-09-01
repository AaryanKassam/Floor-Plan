"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { label12h } from "@/lib/time";
import type { BookingRec, TableRec } from "@/lib/types";

const SHAPES = ["round", "square", "rect", "booth", "bar"] as const;

interface Props {
  table: TableRec;
  booking: BookingRec | undefined;
  onSaved: () => void;
  onBack: () => void;
}

/** Sits below the zoomed table, anchored to the bottom of the viewport. */
export default function TableDetail({ table, booking, onSaved, onBack }: Props) {
  const [seats, setSeats] = useState(table.seats);
  const [number, setNumber] = useState(table.number);
  const [shape, setShape] = useState<string>(table.shape);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSeats(table.seats);
    setNumber(table.number);
    setShape(table.shape);
    setError(null);
  }, [table.id, table.seats, table.number, table.shape]);

  const dirty = seats !== table.seats || number !== table.number || shape !== table.shape;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tables/${table.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seats, number, shape }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    onSaved();
  }

  return (
    <motion.div
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 28, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
      className="pointer-events-auto w-[min(680px,calc(100vw-32px))] border border-[var(--line-strong)] bg-[var(--panel)] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.09em] text-[var(--ink-muted)]">
            {booking ? "Booked" : "Available"}
          </p>
          <h2 className="display text-2xl">Table {table.number}</h2>
        </div>
        <button onClick={onBack} className="btn">
          Back to floor
        </button>
      </div>

      {booking ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[var(--line)] pt-4 sm:grid-cols-4">
          <div>
            <dt className="label">Guest</dt>
            <dd>{booking.name}</dd>
          </div>
          <div>
            <dt className="label">Party</dt>
            <dd>{booking.party_size}</dd>
          </div>
          <div>
            <dt className="label">Seated</dt>
            <dd>
              {label12h(booking.start_min)} to {label12h(booking.end_min)}
            </dd>
          </div>
          <div>
            <dt className="label">Phone</dt>
            <dd>{booking.phone || "Not given"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 border-t border-[var(--line)] pt-4 text-[var(--ink-muted)]">
          Nothing booked here at the selected time.
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-4">
        <div>
          <label className="label" htmlFor="d-number">Table number</label>
          <input id="d-number" type="number" min={1} value={number} onChange={(e) => setNumber(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="d-seats">Seats</label>
          <input id="d-seats" type="number" min={1} max={30} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="d-shape">Shape</label>
          <select id="d-shape" value={shape} onChange={(e) => setShape(e.target.value)}>
            {SHAPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-[#E08A7C]">{error}</p>}

      <button onClick={save} disabled={!dirty || busy} className="btn btn-primary mt-4">
        {busy ? "Saving" : dirty ? "Save changes" : "No changes"}
      </button>
    </motion.div>
  );
}
