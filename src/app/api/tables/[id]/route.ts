import { NextResponse } from "next/server";
import { db, row } from "@/lib/db";
import type { TableRec } from "@/lib/types";

const SHAPES = ["round", "square", "rect", "booth", "bar"];

/** Edit a table's seat count, number, or shape. Pure CRUD — no AI. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tableId = Number(id);

  const existing = row<TableRec>(db.prepare("SELECT * FROM tables WHERE id = ?").get(tableId));
  if (!existing) return NextResponse.json({ error: "Table not found." }, { status: 404 });

  const body = (await req.json()) as Partial<{ seats: number; number: number; shape: string }>;

  const seats = body.seats === undefined ? existing.seats : Math.round(Number(body.seats));
  const number = body.number === undefined ? existing.number : Math.round(Number(body.number));
  const shape = body.shape === undefined ? existing.shape : String(body.shape);

  if (!Number.isFinite(seats) || seats < 1 || seats > 30) {
    return NextResponse.json({ error: "Seats must be between 1 and 30." }, { status: 400 });
  }
  if (!Number.isFinite(number) || number < 1 || number > 9999) {
    return NextResponse.json({ error: "Table number must be between 1 and 9999." }, { status: 400 });
  }
  if (!SHAPES.includes(shape)) {
    return NextResponse.json({ error: "Unknown table shape." }, { status: 400 });
  }

  const clash = db.prepare("SELECT id FROM tables WHERE number = ? AND id != ?").get(number, tableId);
  if (clash) {
    return NextResponse.json({ error: `Table number ${number} is already in use.` }, { status: 409 });
  }

  // Shrinking a table below a party already seated there would corrupt the plan.
  const biggest = db
    .prepare("SELECT MAX(party_size) AS n FROM bookings WHERE table_id = ?")
    .get(tableId) as { n: number | null } | undefined;
  if (biggest?.n && seats < biggest.n) {
    return NextResponse.json(
      { error: `This table already has a booking for ${biggest.n}. Set seats to ${biggest.n} or more.` },
      { status: 409 }
    );
  }

  db.prepare("UPDATE tables SET seats = ?, number = ?, shape = ? WHERE id = ?").run(
    seats,
    number,
    shape,
    tableId
  );

  return NextResponse.json({
    ok: true,
    table: row<TableRec>(db.prepare("SELECT * FROM tables WHERE id = ?").get(tableId)),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  db.prepare("DELETE FROM tables WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
