import { NextResponse } from "next/server";
import { db, rows, row } from "@/lib/db";
import { bookingsOn } from "@/lib/assign";
import { sheetsConfigured } from "@/lib/sheets";
import { activeProvider } from "@/lib/vision";
import { todayISO, isISODate } from "@/lib/time";
import type { RoomRec, TableRec } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const day = date && isISODate(date) ? date : todayISO();

  const venue = row<{ id: number; name: string }>(db.prepare("SELECT * FROM venue WHERE id = 1").get());
  const roomList = rows<RoomRec>(db.prepare("SELECT * FROM rooms ORDER BY sort_order, id").all());
  const tables = rows<TableRec>(db.prepare("SELECT * FROM tables ORDER BY number").all());

  return NextResponse.json({
    venue,
    rooms: roomList,
    tables,
    bookings: bookingsOn(day),
    date: day,
    sheetsConfigured: sheetsConfigured(),
    provider: activeProvider(),
  });
}
