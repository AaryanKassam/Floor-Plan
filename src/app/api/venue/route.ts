import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowedBooked, isAllowedFree } from "@/lib/palette";

/** Update venue-wide display settings. Colours are restricted to the palette. */
export async function PATCH(req: Request) {
  const exists = db.prepare("SELECT id FROM venue WHERE id = 1").get();
  if (!exists) return NextResponse.json({ error: "No venue yet." }, { status: 404 });

  const body = (await req.json()) as Partial<{ freeColor: string; bookedColor: string; name: string }>;

  if (body.freeColor !== undefined) {
    if (!isAllowedFree(body.freeColor)) {
      return NextResponse.json({ error: "That free colour is not in the palette." }, { status: 400 });
    }
    db.prepare("UPDATE venue SET free_color = ? WHERE id = 1").run(body.freeColor);
  }

  if (body.bookedColor !== undefined) {
    if (!isAllowedBooked(body.bookedColor)) {
      return NextResponse.json({ error: "That booked colour is not in the palette." }, { status: 400 });
    }
    db.prepare("UPDATE venue SET booked_color = ? WHERE id = 1").run(body.bookedColor);
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    db.prepare("UPDATE venue SET name = ? WHERE id = 1").run(name);
  }

  return NextResponse.json({ ok: true });
}

/** Clear the whole venue so the app returns to the upload screen. */
export async function DELETE() {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM bookings");
    db.exec("DELETE FROM tables");
    db.exec("DELETE FROM rooms");
    db.exec("DELETE FROM venue");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return NextResponse.json({ ok: true });
}
