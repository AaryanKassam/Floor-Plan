import { db, rows, row } from "./db";
import { DEFAULT_DURATION, SLOT_STEP, slots, toHHMM } from "./time";
import type { BookingRec, TableRec } from "./types";

/**
 * Deterministic table assignment. No LLM is involved anywhere in this file —
 * availability is a SQL predicate, not a judgement call. Two overlapping
 * requests cannot both win because the whole check-then-insert runs inside a
 * BEGIN IMMEDIATE transaction, which takes the write lock up front.
 */

export interface BookingRequest {
  name: string;
  partySize: number;
  date: string;
  startMin: number;
  durationMin?: number;
  phone?: string | null;
  notes?: string | null;
}

export type BookingResult =
  | { ok: true; booking: BookingRec; table: TableRec }
  | { ok: false; reason: string; alternatives: string[] };

/** Tables that are free for [startMin, endMin) on `date`, best fit first. */
function freeTables(date: string, startMin: number, endMin: number, partySize: number): TableRec[] {
  const stmt = db.prepare(`
    SELECT t.* FROM tables t
    WHERE t.seats >= ?
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.table_id = t.id
          AND b.date = ?
          AND b.start_min < ?
          AND b.end_min   > ?
      )
    ORDER BY t.seats ASC, t.number ASC
  `);
  return rows<TableRec>(stmt.all(partySize, date, endMin, startMin));
}

/** Nearest other start times that could seat this party, for a helpful 409. */
function findAlternatives(date: string, wantedStart: number, partySize: number, duration: number): string[] {
  const candidates = slots()
    .filter((s) => s !== wantedStart)
    .sort((a, b) => Math.abs(a - wantedStart) - Math.abs(b - wantedStart));

  const out: string[] = [];
  for (const s of candidates) {
    if (freeTables(date, s, s + duration, partySize).length > 0) {
      out.push(toHHMM(s));
      if (out.length === 3) break;
    }
  }
  return out.sort();
}

export function createBooking(req: BookingRequest): BookingResult {
  const duration = req.durationMin ?? DEFAULT_DURATION;
  const startMin = req.startMin;
  const endMin = startMin + duration;

  db.exec("BEGIN IMMEDIATE");
  try {
    const candidates = freeTables(req.date, startMin, endMin, req.partySize);

    if (candidates.length === 0) {
      db.exec("ROLLBACK");
      const anyBigEnough = db
        .prepare("SELECT COUNT(*) AS n FROM tables WHERE seats >= ?")
        .get(req.partySize) as { n: number } | undefined;

      const reason =
        !anyBigEnough || anyBigEnough.n === 0
          ? `No table in this restaurant seats ${req.partySize}.`
          : `All tables for ${req.partySize} are taken at ${toHHMM(startMin)}.`;

      return { ok: false, reason, alternatives: findAlternatives(req.date, startMin, req.partySize, duration) };
    }

    const table = candidates[0]; // best fit: fewest wasted seats
    const createdAt = new Date().toISOString();

    const info = db
      .prepare(
        `INSERT INTO bookings
           (table_id, name, party_size, date, start_min, end_min, phone, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        table.id,
        req.name,
        req.partySize,
        req.date,
        startMin,
        endMin,
        req.phone ?? null,
        req.notes ?? null,
        createdAt
      );

    db.exec("COMMIT");

    const booking = row<BookingRec>(
      db.prepare("SELECT * FROM bookings WHERE id = ?").get(Number(info.lastInsertRowid))
    )!;

    return { ok: true, booking, table };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

/** Which table is occupied at a given moment — drives the green/red rendering. */
export function occupancyAt(date: string, atMin: number): Map<number, BookingRec> {
  const bs = rows<BookingRec>(
    db
      .prepare("SELECT * FROM bookings WHERE date = ? AND start_min <= ? AND end_min > ? ORDER BY id")
      .all(date, atMin, atMin)
  );
  const m = new Map<number, BookingRec>();
  for (const b of bs) m.set(b.table_id, b);
  return m;
}

export function bookingsOn(date: string): BookingRec[] {
  return rows<BookingRec>(
    db.prepare("SELECT * FROM bookings WHERE date = ? ORDER BY start_min, id").all(date)
  );
}

export const SLOT_MINUTES = SLOT_STEP;
