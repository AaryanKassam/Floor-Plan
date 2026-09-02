import { NextResponse } from "next/server";
import { db, row } from "@/lib/db";
import { FLOORS } from "@/lib/floors";
import type { RoomRec } from "@/lib/types";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const roomId = Number(id);

  const existing = row<RoomRec>(db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId));
  if (!existing) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const body = (await req.json()) as Partial<{ floor: string; name: string; isOutdoor: boolean }>;

  const floor = body.floor === undefined ? existing.floor : String(body.floor);
  const name = body.name === undefined ? existing.name : String(body.name).trim().slice(0, 40);

  if (!FLOORS.some((f) => f.id === floor)) {
    return NextResponse.json({ error: "Unknown floor material." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Room name cannot be empty." }, { status: 400 });

  const isOutdoor =
    body.isOutdoor === undefined ? existing.is_outdoor : body.isOutdoor ? 1 : 0;

  db.prepare("UPDATE rooms SET floor = ?, name = ?, is_outdoor = ? WHERE id = ?").run(
    floor,
    name,
    isOutdoor,
    roomId
  );
  return NextResponse.json({ ok: true });
}
