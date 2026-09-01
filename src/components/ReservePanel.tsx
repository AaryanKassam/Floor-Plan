"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { label12h, slots, toHHMM } from "@/lib/time";

interface Props {
  date: string;
  onBooked: () => void;
  onClose: () => void;
}

export default function ReservePanel({ date, onBooked, onClose }: Props) {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [time, setTime] = useState("18:00");
  const [bookDate, setBookDate] = useState(date);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alts, setAlts] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAlts([]);
    setSuccess(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, partySize, date: bookDate, time, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the booking.");
        setAlts(Array.isArray(data.alternatives) ? data.alternatives : []);
        return;
      }
      setSuccess(`Table ${data.table.number} confirmed for ${name}.`);
      setName("");
      setPhone("");
      onBooked();
    } catch {
      setError("Network error. Is the dev server still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.aside
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -24, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
      className="pointer-events-auto w-[330px] border border-[var(--line-strong)] bg-[var(--panel)] p-5"
      aria-label="Reserve a seat"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="display text-xl">Reserve a Seat</h2>
        <button onClick={onClose} className="btn px-2 py-1 text-sm">Close</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="r-name">Name</label>
          <input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="r-party">People</label>
            <input id="r-party" type="number" min={1} max={30} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} required />
          </div>
          <div>
            <label className="label" htmlFor="r-time">Time</label>
            <select id="r-time" value={time} onChange={(e) => setTime(e.target.value)}>
              {slots().map((s) => (
                <option key={s} value={toHHMM(s)}>{label12h(s)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="r-date">Date</label>
          <input id="r-date" type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)} required />
        </div>

        <div>
          <label className="label" htmlFor="r-phone">Phone (optional)</label>
          <input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Finding a table" : "Book table"}
        </button>
      </form>

      {success && (
        <p className="mt-3 border border-[#4A6B4F] bg-[#22301F] px-3 py-2 text-sm">{success}</p>
      )}

      {error && (
        <div className="mt-3 border border-[#7A3B30] bg-[#2E1B17] px-3 py-2 text-sm">
          <p>{error}</p>
          {alts.length > 0 && (
            <>
              <p className="mt-2 label">Available instead</p>
              <div className="flex flex-wrap gap-1.5">
                {alts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => { setTime(a); setError(null); setAlts([]); }}
                    className="btn px-2 py-1 text-xs"
                  >
                    {label12h(Number(a.slice(0, 2)) * 60 + Number(a.slice(3)))}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </motion.aside>
  );
}
