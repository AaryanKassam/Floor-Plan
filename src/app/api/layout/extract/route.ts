import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { extractTables } from "@/lib/vision";
import type { MediaType } from "@/lib/vision";

export const maxDuration = 300;

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Extract ONE room per request so the client can show real progress across a
 * multi-image upload. index 0 resets the venue; later indexes append a room and
 * continue table numbering from the highest number already stored.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const roomName = String(form.get("name") ?? "").trim() || "Main Floor";
    const index = Number(form.get("index") ?? 0);
    const venueName = String(form.get("venue") ?? "").trim() || "My Restaurant";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type || "unknown"}". Use PNG, JPEG, WEBP or GIF.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name} is ${(file.size / 1048576).toFixed(1)}MB. Keep each image under 5MB.` },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");

    // Extract FIRST, then touch the database. Doing the reset up front meant a
    // failed or refused extraction wiped the existing venue and left an empty
    // one behind, with no way back except re-uploading.
    const startNumber =
      index === 0
        ? 1
        : (db.prepare("SELECT COALESCE(MAX(number), 0) AS n FROM tables").get() as { n: number }).n + 1;

    const result = await extractTables(base64, file.type as MediaType, startNumber);

    if (index === 0) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec("DELETE FROM bookings");
        db.exec("DELETE FROM tables");
        db.exec("DELETE FROM rooms");
        db.exec("DELETE FROM venue");
        db.prepare("INSERT INTO venue (id, name) VALUES (1, ?)").run(venueName);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filename = `room-${Date.now()}-${index}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buf);

    db.exec("BEGIN IMMEDIATE");
    try {
      const info = db
        .prepare(
          "INSERT INTO rooms (name, sort_order, image_path, image_w, image_h, floor) VALUES (?, ?, ?, 1000, 680, 'white-oak')"
        )
        .run(roomName, index, `/uploads/${filename}`);
      const roomId = Number(info.lastInsertRowid);

      const ins = db.prepare(
        `INSERT INTO tables (room_id, number, seats, shape, x, y, w, h, rotation, area)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      );
      for (const t of result.tables) {
        ins.run(roomId, t.number, t.seats, t.shape, t.x, t.y, t.w, t.h, t.area ?? null);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return NextResponse.json({
      ok: true,
      room: roomName,
      count: result.tables.length,
      provider: result.provider,
      model: result.model,
      cost: result.costUSD,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    const status = message.includes("API key") || message.includes("API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
