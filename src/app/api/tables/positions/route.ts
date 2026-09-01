import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Bulk-save table positions after an edit-mode session. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const list = (body as { positions?: unknown }).positions;
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "Expected a positions array." }, { status: 400 });
  }
  if (list.length > 500) {
    return NextResponse.json({ error: "Too many positions." }, { status: 400 });
  }

  const update = db.prepare("UPDATE tables SET x = ?, y = ?, group_id = ? WHERE id = ?");
  let changed = 0;

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const { id, x, y, groupId } = item as {
        id: unknown;
        x: unknown;
        y: unknown;
        groupId?: unknown;
      };
      if (typeof id !== "number" || typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const group = typeof groupId === "number" && Number.isFinite(groupId) ? groupId : null;
      // Clamp server-side too: never trust client geometry.
      changed += Number(update.run(clamp(x, 0, 1), clamp(y, 0, 1), group, id).changes);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return NextResponse.json({ ok: true, updated: changed });
}
