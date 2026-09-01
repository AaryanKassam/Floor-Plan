import { NextResponse } from "next/server";
import { db, row } from "@/lib/db";
import { deleteBooking, sheetsConfigured } from "@/lib/sheets";
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
