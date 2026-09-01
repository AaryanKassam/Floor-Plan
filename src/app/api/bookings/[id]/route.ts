import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const info = db.prepare("DELETE FROM bookings WHERE id = ?").run(Number(id));
  if (info.changes === 0) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
