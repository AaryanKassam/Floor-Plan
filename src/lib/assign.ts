import { db, rows, row } from "./db";
import { DEFAULT_DURATION, SLOT_STEP, SOON_MINUTES, slots, toHHMM } from "./time";
import type { BookingRec, SeatingPreference, TableRec } from "./types";

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
  preference?: SeatingPreference;
}

export type BookingResult =
  | { ok: true; booking: BookingRec; table: TableRec }
  /** The requested indoor/outdoor preference cannot be met, but the other kind
   *  is free. Nothing is written; the caller decides whether to ask the guest. */
  | { ok: false; kind: "preference"; offered: "indoor" | "outdoor"; reason: string }
  | { ok: false; kind: "full"; reason: string; alternatives: string[] };

/**
 * Tables free for [startMin, endMin) on `date`, best fit first.
 * `outdoor` filters by the room's seating kind: 1 outdoor, 0 indoor, null any.
 * `ignoreBookingId` lets an edit exclude the booking being moved, so a booking
 * never blocks itself.
 */
function freeTables(
  date: string,
  startMin: number,
  endMin: number,
  partySize: number,
  outdoor: 0 | 1 | null = null,
  ignoreBookingId: number | null = null
): TableRec[] {
  /*
   * Ordering, in priority order:
   *   1. seats  best fit stays primary. Demoting it below the tier would seat a
   *             party of two at a ten-top whenever a two-top had any booking
   *             later that day, which wastes the room.
   *   2. tier   among tables of the SAME size: a clear table first, then one
   *             whose nearest booking is far off, then one with a booking close
   *             by. Keeps clear tables clear and leaves turnaround room.
   *   3. number stable tie-break.
   *
   * `day_gap` is the distance in minutes from the wanted slot to the nearest
   * OTHER booking on that table that day, NULL when it has none. It is also
   * what drives the yellow/red dots in the UI.
   */
  const stmt = db.prepare(`
    SELECT t.*, gap.g AS day_gap FROM tables t
    JOIN rooms r ON r.id = t.room_id
    LEFT JOIN (
      SELECT b.table_id AS tid,
             MIN(CASE WHEN b.start_min >= :at THEN b.start_min - :at
                      ELSE :at - b.end_min END) AS g
      FROM bookings b
      WHERE b.date = :date AND (:ignore IS NULL OR b.id != :ignore)
      GROUP BY b.table_id
    ) AS gap ON gap.tid = t.id
    WHERE t.seats >= :party
      AND (:outdoor IS NULL OR r.is_outdoor = :outdoor)
      AND NOT EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.table_id = t.id
          AND b2.date = :date
          AND b2.start_min < :endMin
          AND b2.end_min   > :startMin
          AND (:ignore IS NULL OR b2.id != :ignore)
      )
    ORDER BY
      t.seats ASC,
      CASE WHEN gap.g IS NULL THEN 0
           WHEN gap.g > :soon THEN 1
           ELSE 2 END ASC,
      t.number ASC
  `);
  return rows<TableRec>(
    stmt.all({
      at: startMin,
      date,
      party: partySize,
      outdoor,
      startMin,
      endMin,
      ignore: ignoreBookingId,
      soon: SOON_MINUTES,
    })
  );
}

function prefToFlag(p: SeatingPreference | undefined): 0 | 1 | null {
  if (p === "indoor") return 0;
  if (p === "outdoor") return 1;
  return null;
}

/** Nearest other start times that could seat this party, for a helpful 409. */
function findAlternatives(date: string, wantedStart: number, partySize: number, duration: number): string[] {
  const candidates = slots()
    .filter((s) => s !== wantedStart)
    .sort((a, b) => Math.abs(a - wantedStart) - Math.abs(b - wantedStart));

  const out: string[] = [];
  for (const s of candidates) {
    if (freeTables(date, s, s + duration, partySize, null, null).length > 0) {
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

  const wanted = prefToFlag(req.preference);

  db.exec("BEGIN IMMEDIATE");
  try {
    let candidates = freeTables(req.date, startMin, endMin, req.partySize, wanted);

    if (candidates.length === 0 && wanted !== null) {
      // The preference cannot be met. If the other kind is free, hand that back
      // as an offer rather than silently seating them where they did not ask.
      const other = freeTables(req.date, startMin, endMin, req.partySize, wanted === 1 ? 0 : 1);
      if (other.length > 0) {
        db.exec("ROLLBACK");
        const offered = wanted === 1 ? "indoor" : "outdoor";
        const asked = wanted === 1 ? "outdoor" : "indoor";
        return {
          ok: false,
          kind: "preference",
          offered,
          reason: `No ${asked} table for ${req.partySize} at ${toHHMM(startMin)}. Only ${offered} seating is available.`,
        };
      }
      candidates = [];
    }

    if (candidates.length === 0) {
      db.exec("ROLLBACK");
      const anyBigEnough = db
        .prepare("SELECT COUNT(*) AS n FROM tables WHERE seats >= ?")
        .get(req.partySize) as { n: number } | undefined;

      const reason =
        !anyBigEnough || anyBigEnough.n === 0
          ? `No table in this restaurant seats ${req.partySize}.`
          : `All tables for ${req.partySize} are taken at ${toHHMM(startMin)}.`;

      return {
        ok: false,
        kind: "full",
        reason,
        alternatives: findAlternatives(req.date, startMin, req.partySize, duration),
      };
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

/* ---------- Editing an existing booking ---------- */

export interface EditRequest {
  bookingId: number;
  startMin?: number;
  tableId?: number;
  date?: string;
}

export type EditResult =
  | { ok: true; booking: BookingRec; table: TableRec }
  | { ok: false; reason: string };

/**
 * Move a booking to a different time and/or table.
 *
 * Runs the same overlap check as creation, inside the same kind of
 * transaction, but excludes the booking itself so it never blocks its own
 * move. A booking that fails validation is left exactly as it was.
 */
export function editBooking(req: EditRequest): EditResult {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = row<BookingRec>(
      db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.bookingId)
    );
    if (!current) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "Booking not found." };
    }

    const date = req.date ?? current.date;
    const startMin = req.startMin ?? current.start_min;
    const duration = current.end_min - current.start_min;
    const endMin = startMin + duration;
    const tableId = req.tableId ?? current.table_id;

    const table = row<TableRec>(db.prepare("SELECT * FROM tables WHERE id = ?").get(tableId));
    if (!table) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "That table no longer exists." };
    }
    if (table.seats < current.party_size) {
      db.exec("ROLLBACK");
      return {
        ok: false,
        reason: `Table ${table.number} seats ${table.seats}, but the party is ${current.party_size}.`,
      };
    }

    const clash = db
      .prepare(
        `SELECT id FROM bookings
         WHERE table_id = ? AND date = ? AND id != ? AND start_min < ? AND end_min > ?`
      )
      .get(tableId, date, req.bookingId, endMin, startMin);
    if (clash) {
      db.exec("ROLLBACK");
      return { ok: false, reason: `Table ${table.number} is already booked at ${toHHMM(startMin)}.` };
    }

    db.prepare(
      "UPDATE bookings SET table_id = ?, date = ?, start_min = ?, end_min = ? WHERE id = ?"
    ).run(tableId, date, startMin, endMin, req.bookingId);

    db.exec("COMMIT");

    return {
      ok: true,
      booking: row<BookingRec>(
        db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.bookingId)
      )!,
      table,
    };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

/** Tables that could host this booking at a given time, for the edit dropdown. */
export function tablesForBooking(bookingId: number, date: string, startMin: number): TableRec[] {
  const b = row<BookingRec>(db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId));
  if (!b) return [];
  const endMin = startMin + (b.end_min - b.start_min);
  return freeTables(date, startMin, endMin, b.party_size, null, bookingId);
}
