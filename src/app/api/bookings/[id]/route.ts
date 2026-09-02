import { NextResponse } from "next/server";
import { db, row, rows } from "@/lib/db";
import { editBooking, tablesForBooking } from "@/lib/assign";
import { CLOSE_MIN, OPEN_MIN, isISODate, isPast, toHHMM, toMin } from "@/lib/time";
import { appendBooking, deleteBooking, sheetsConfigured } from "@/lib/sheets";
import type { BookingRec } from "@/lib/types";

/**
 * Cancel a booking. The local row is the source of truth, so it is removed
 * first; the sheet is then cleaned up on a best-effort basis and its outcome
 * reported back so the UI can say if the sheet still holds the row.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bookingId = Number(id);

  const existing = row<BookingRec>(
    db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId)
  );
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);

  if (!sheetsConfigured()) return NextResponse.json({ ok: true, sheet: null });

  const sheet = await deleteBooking(bookingId);
  return NextResponse.json({ ok: true, sheet });
}

/** Change a booking's time and/or table. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bookingId = Number(id);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = row<BookingRec>(
    db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId)
  );
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const date = body.date === undefined ? existing.date : String(body.date);
  if (!isISODate(date)) return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });

  let startMin = existing.start_min;
  if (body.time !== undefined) {
    try {
      startMin = toMin(String(body.time));
    } catch {
      return NextResponse.json({ error: "Time must be HH:MM." }, { status: 400 });
    }
  }
  if (startMin < OPEN_MIN || startMin >= CLOSE_MIN) {
    return NextResponse.json(
      { error: `We seat between ${toHHMM(OPEN_MIN)} and ${toHHMM(CLOSE_MIN)}.` },
      { status: 400 }
    );
  }
  if (isPast(date, startMin)) {
    return NextResponse.json({ error: "That time has already passed." }, { status: 400 });
  }

  const tableId = body.tableId === undefined ? undefined : Number(body.tableId);
  if (tableId !== undefined && !Number.isFinite(tableId)) {
    return NextResponse.json({ error: "Invalid table." }, { status: 400 });
  }

  const result = editBooking({ bookingId, date, startMin, tableId });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });

  // Keep the sheet row in step with the change.
  let sheet = null;
  if (sheetsConfigured()) {
    await deleteBooking(bookingId);
    sheet = await appendBooking({
      id: result.booking.id,
      name: result.booking.name,
      date: result.booking.date,
      time: toHHMM(result.booking.start_min),
      partySize: result.booking.party_size,
      tableNumber: result.table.number,
      phone: result.booking.phone,
      notes: result.booking.notes,
      createdAt: result.booking.created_at,
    });
    db.prepare("UPDATE bookings SET sheet_synced = ? WHERE id = ?").run(
      sheet.synced ? 1 : 0,
      bookingId
    );
  }

  return NextResponse.json({ ok: true, booking: result.booking, table: result.table, sheet });
}

/** Tables this booking could move to at a given time. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const b = row<BookingRec>(db.prepare("SELECT * FROM bookings WHERE id = ?").get(Number(id)));
  if (!b) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const date = url.searchParams.get("date") ?? b.date;
  const timeParam = url.searchParams.get("time");
  let startMin = b.start_min;
  if (timeParam) {
    try {
      startMin = toMin(timeParam);
    } catch {
      /* keep the current time */
    }
  }

  const options = tablesForBooking(Number(id), date, startMin);
  const currentTable = rows<{ id: number; number: number; seats: number; room_id: number }>(
    db.prepare("SELECT id, number, seats, room_id FROM tables WHERE id = ?").all(b.table_id)
  );
  return NextResponse.json({ options, current: currentTable[0] ?? null });
}
