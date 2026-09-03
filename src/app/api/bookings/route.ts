import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createBooking } from "@/lib/assign";
import { appendBooking } from "@/lib/sheets";
import { CLOSE_MIN, OPEN_MIN, isISODate, isPast, toHHMM, toMin } from "@/lib/time";

/**
 * Create a reservation.
 *
 * The table is chosen by deterministic best-fit inside a transaction
 * (see lib/assign.ts). The Google Sheet is written afterwards and is not
 * allowed to fail the booking.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const date = String(body.date ?? "").trim();
  const time = String(body.time ?? "").trim();
  // Not Math.round: 2.5 people is a typo, not a party of three.
  const partySize = Number(body.partySize);

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  if (!isISODate(date)) return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
    return NextResponse.json(
      { error: "Party size must be a whole number between 1 and 30." },
      { status: 400 }
    );
  }

  let startMin: number;
  try {
    startMin = toMin(time);
  } catch {
    return NextResponse.json({ error: "Time must be HH:MM." }, { status: 400 });
  }
  if (startMin < OPEN_MIN || startMin >= CLOSE_MIN) {
    return NextResponse.json(
      { error: `We seat between ${toHHMM(OPEN_MIN)} and ${toHHMM(CLOSE_MIN)}.` },
      { status: 400 }
    );
  }

  // Enforced here, not just in the UI: the browser can send anything.
  if (isPast(date, startMin)) {
    return NextResponse.json(
      { error: "That time has already passed. Pick a later slot." },
      { status: 400 }
    );
  }

  const rawPref = String(body.preference ?? "any");
  const preference =
    rawPref === "indoor" || rawPref === "outdoor" ? (rawPref as "indoor" | "outdoor") : "any";

  const tableCount = db.prepare("SELECT COUNT(*) AS n FROM tables").get() as { n: number };
  if (tableCount.n === 0) {
    return NextResponse.json(
      { error: "No floor plan loaded yet. Upload one or load the demo layout first." },
      { status: 409 }
    );
  }

  const result = createBooking({
    name,
    partySize,
    date,
    startMin,
    preference,
    phone: body.phone ? String(body.phone).slice(0, 40) : null,
    notes: body.notes ? String(body.notes).slice(0, 300) : null,
  });

  if (!result.ok) {
    // A preference miss is a question for the guest, not a dead end: the UI
    // offers to book the other kind rather than the caller losing the slot.
    if (result.kind === "preference") {
      return NextResponse.json(
        { error: result.reason, offered: result.offered },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: result.reason, alternatives: result.alternatives },
      { status: 409 }
    );
  }

  const sync = await appendBooking({
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

  if (sync.synced) {
    db.prepare("UPDATE bookings SET sheet_synced = 1 WHERE id = ?").run(result.booking.id);
  }

  return NextResponse.json({
    ok: true,
    booking: { ...result.booking, sheet_synced: sync.synced ? 1 : 0 },
    table: result.table,
    sheet: sync,
  });
}
