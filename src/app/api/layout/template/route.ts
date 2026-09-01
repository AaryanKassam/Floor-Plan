import { NextResponse } from "next/server";
import { replaceVenue } from "@/lib/db";
import { TEMPLATE_ROOMS } from "@/lib/template";

/** Load the built-in demo venue. Costs nothing and needs no API key. */
export async function POST() {
  replaceVenue(
    "Daily Bean",
    TEMPLATE_ROOMS.map((r) => ({
      name: r.name,
      imagePath: null,
      floor: r.floor,
      tables: r.tables.map((t) => ({ ...t, area: t.area ?? null })),
    }))
  );
  const count = TEMPLATE_ROOMS.reduce((n, r) => n + r.tables.length, 0);
  return NextResponse.json({ ok: true, rooms: TEMPLATE_ROOMS.length, count });
}
