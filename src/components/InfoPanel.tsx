"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { isPast, label12h, slots, toHHMM } from "@/lib/time";
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

  // Cancelling is irreversible and also removes the sheet row, so it asks
  // once. An inline confirm keeps it in place rather than throwing a browser
  // dialog over the plan.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Inline edit state for one booking at a time.
  const [editId, setEditId] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("18:00");
  const [editTable, setEditTable] = useState<number | null>(null);
  const [options, setOptions] = useState<{ id: number; number: number; seats: number }[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  /**
   * Ask the server which tables are free for this booking at a given time.
   * The selected table is reconciled against the new list: changing the time
   * can retire the table that was chosen, and submitting a stale id would
   * either fail or move the guest somewhere they never picked.
   */
  async function loadOptions(bookingId: number, time: string) {
    let data: {
      options?: { id: number; number: number; seats: number }[];
      current?: { id: number; number: number; seats: number };
    };
    try {
      const res = await fetch(`/api/bookings/${bookingId}?date=${date}&time=${time}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setOptions([]);
        setEditTable(null);
        setEditError("Could not load available tables for that time.");
        return;
      }
      data = await res.json();
    } catch {
      setOptions([]);
      setEditTable(null);
      setEditError("Could not reach the server.");
      return;
    }

    const opts = [...(data.options ?? [])];
    // The table it already sits on is a valid choice but is excluded from the
    // free list, so add it back.
    if (data.current && !opts.some((o) => o.id === data.current!.id)) {
      opts.push(data.current);
    }
    opts.sort((a, b) => a.number - b.number);
    setOptions(opts);
    setEditError(opts.length === 0 ? "No tables are free at that time." : null);
    setEditTable((cur) =>
      cur != null && opts.some((o) => o.id === cur) ? cur : (opts[0]?.id ?? null)
    );
  }

  function beginEdit(b: BookingRec) {
    setEditId(b.id);
    setEditError(null);
    setConfirmId(null);
    const t = toHHMM(b.start_min);
    setEditTime(t);
    setEditTable(b.table_id);
    void loadOptions(b.id, t);
  }

  async function saveEdit(bookingId: number) {
    if (editTable == null) {
      setEditError("Pick a table first.");
      return;
    }
    setEditError(null);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: editTime, tableId: editTable, date }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEditError(data.error ?? "Could not save.");
      return;
    }
    setEditId(null);
    onChanged();
  }

  async function cancel(id: number) {
    setBusyId(id);
    setWarning(null);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.sheet && data.sheet.synced === false) {
        setWarning(`Cancelled, but the sheet row could not be removed: ${data.sheet.reason}`);
      }
    } finally {
      setBusyId(null);
      setConfirmId(null);
      onChanged();
    }
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
                    {confirmId === b.id && (
                      <p className="mt-1 text-xs text-[#E0A99C]">
                        Cancel this booking{sheetsConfigured ? " and remove it from the sheet" : ""}?
                        This cannot be undone.
                      </p>
                    )}
                  </div>
                  {confirmId === b.id ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => cancel(b.id)}
                        disabled={busyId === b.id}
                        className="btn border-[#7A3B30] px-2 py-1 text-xs"
                      >
                        {busyId === b.id ? "Cancelling" : "Yes, cancel"}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="btn px-2 py-1 text-xs">
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => (editId === b.id ? setEditId(null) : beginEdit(b))}
                        className="btn px-2 py-1 text-xs"
                      >
                        {editId === b.id ? "Close" : "Edit"}
                      </button>
                      <button
                        onClick={() => { setConfirmId(b.id); setWarning(null); }}
                        className="btn px-2 py-1 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {editId === b.id && (
                  <div className="mt-3 border-t border-[var(--line)] pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label" htmlFor={`et-${b.id}`}>Time</label>
                        <select
                          id={`et-${b.id}`}
                          value={editTime}
                          onChange={(e) => {
                            setEditTime(e.target.value);
                            void loadOptions(b.id, e.target.value);
                          }}
                        >
                          {slots()
                            .filter((s) => !isPast(date, s))
                            .map((s) => (
                              <option key={s} value={toHHMM(s)}>{label12h(s)}</option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor={`eb-${b.id}`}>Table</label>
                        <select
                          id={`eb-${b.id}`}
                          value={editTable ?? ""}
                          onChange={(e) => setEditTable(Number(e.target.value))}
                        >
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.number} ({o.seats} seats)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {options.length === 0 && (
                      <p className="mt-2 text-xs text-[#D9A441]">
                        No table is free for {b.party_size} at that time.
                      </p>
                    )}
                    {editError && <p className="mt-2 text-xs text-[#E0A99C]">{editError}</p>}

                    <button
                      onClick={() => saveEdit(b.id)}
                      disabled={options.length === 0}
                      className="btn btn-primary mt-3 w-full text-sm"
                    >
                      Save changes
                    </button>
                  </div>
                )}
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
