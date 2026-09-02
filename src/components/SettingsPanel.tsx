"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FLOORS } from "@/lib/floors";
import { BOOKED_COLORS, FREE_COLORS } from "@/lib/palette";
import type { RoomRec } from "@/lib/types";

interface Props {
  room: RoomRec;
  freeColor: string;
  bookedColor: string;
  onChanged: () => void;
  onClose: () => void;
}

export default function SettingsPanel({
  room,
  freeColor,
  bookedColor,
  onChanged,
  onClose,
}: Props) {
  async function setFloor(floor: string) {
    await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ floor }),
    });
    onChanged();
  }

  const [confirming, setConfirming] = useState(false);

  async function replacePlan() {
    await fetch("/api/venue", { method: "DELETE" });
    onChanged();
  }

  async function setOutdoor(isOutdoor: boolean) {
    await fetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isOutdoor }),
    });
    onChanged();
  }

  async function setColor(patch: { freeColor?: string; bookedColor?: string }) {
    await fetch("/api/venue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChanged();
  }

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
      className="pointer-events-auto flex max-h-full w-[320px] flex-col border border-[var(--line-strong)] bg-[var(--panel)]"
      aria-label="Settings"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
        <h2 className="display text-xl">Settings</h2>
        <button onClick={onClose} className="btn px-2 py-1 text-sm">Close</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="label">Floor material, {room.name}</p>
        <div className="grid grid-cols-2 gap-2">
          {FLOORS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFloor(f.id)}
              aria-pressed={room.floor === f.id}
              className="flex items-center gap-2 border p-1.5 text-left text-xs"
              style={{
                borderColor: room.floor === f.id ? "var(--brass)" : "var(--line)",
                background: room.floor === f.id ? "var(--panel-2)" : "transparent",
              }}
            >
              <span
                className="block h-6 w-6 shrink-0 border border-[var(--line-strong)]"
                style={{ background: f.base }}
              />
              {f.label}
            </button>
          ))}
        </div>

        <p className="label mt-6">Seating kind, {room.name}</p>
        <div className="flex gap-2">
          {[
            { label: "Indoor", value: false },
            { label: "Outdoor", value: true },
          ].map((opt) => {
            const on = Boolean(room.is_outdoor) === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => setOutdoor(opt.value)}
                aria-pressed={on}
                className="flex-1 border py-1.5 text-sm"
                style={{
                  borderColor: on ? (opt.value ? "var(--outdoor)" : "var(--brass)") : "var(--line)",
                  background: on ? "var(--panel-2)" : "transparent",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
          Guests can ask for indoor or outdoor when booking. Outdoor rooms show green
          on the room selector.
        </p>

        <p className="label mt-6">Free table colour</p>
        <div className="flex flex-wrap gap-2">
          {FREE_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setColor({ freeColor: c.hex })}
              aria-label={`Free tables in ${c.label}`}
              aria-pressed={freeColor.toLowerCase() === c.hex.toLowerCase()}
              title={c.label}
              className="h-9 w-9 border-2"
              style={{
                background: c.hex,
                borderColor:
                  freeColor.toLowerCase() === c.hex.toLowerCase() ? "var(--brass)" : "var(--line)",
              }}
            />
          ))}
        </div>

        <p className="label mt-6">Booked table colour</p>
        <div className="flex flex-wrap gap-2">
          {BOOKED_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setColor({ bookedColor: c.hex })}
              aria-label={`Booked tables in ${c.label}`}
              aria-pressed={bookedColor.toLowerCase() === c.hex.toLowerCase()}
              title={c.label}
              className="h-9 w-9 border-2"
              style={{
                background: c.hex,
                borderColor:
                  bookedColor.toLowerCase() === c.hex.toLowerCase()
                    ? "var(--brass)"
                    : "var(--line)",
              }}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-muted)]">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3" style={{ background: freeColor }} /> Free
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3" style={{ background: bookedColor }} /> Booked
          </span>
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <p className="label">Floor plan</p>
          {confirming ? (
            <>
              <p className="mb-2 text-sm">
                This deletes every room, table and booking, and returns you to the
                upload screen. It cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={replacePlan} className="btn flex-1 border-[#7A3B30] text-sm">
                  Delete and start over
                </button>
                <button onClick={() => setConfirming(false)} className="btn text-sm">
                  Keep
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="btn w-full text-sm">
              Upload a new floor plan
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
