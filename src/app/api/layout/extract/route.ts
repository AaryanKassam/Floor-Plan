import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, rows } from "@/lib/db";
import { extractTables } from "@/lib/vision";
import type { MediaType } from "@/lib/vision";

export const maxDuration = 300;

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Remove an uploaded file, ignoring "already gone". */
async function discard(filePath: string) {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

/**
 * Extract ONE room per request so the client can show real progress across a
 * multi-image upload. index 0 replaces the venue; later indexes append a room.
 */
export async function POST(req: Request) {
  let writtenPath: string | null = null;

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
    if (!Number.isInteger(index) || index < 0 || index > 2) {
      return NextResponse.json({ error: "Invalid image index." }, { status: 400 });
    }

    // A continuation (index > 0) only makes sense against a venue that the
    // matching index-0 request created. Without this, a stale second image
    // from an abandoned upload could graft a room onto a different venue.
    if (index > 0) {
      const venue = db.prepare("SELECT id FROM venue WHERE id = 1").get();
      if (!venue) {
        return NextResponse.json(
          { error: "Start the upload again: the first image was not saved." },
          { status: 409 }
        );
      }
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Extract BEFORE touching the database. Resetting up front meant a failed
    // or refused extraction wiped the venue and left an empty one behind.
    // Numbering here is provisional; it is finalised inside the transaction.
    const result = await extractTables(buf.toString("base64"), file.type as MediaType, 1);

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    // randomUUID, not just the timestamp: two uploads in the same
    // millisecond with the same index would otherwise overwrite each other.
    const filename = `room-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    writtenPath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(writtenPath, buf);

    // One transaction for the whole write: the venue reset, the room and its
    // tables. Splitting them meant a failed room insert could leave an empty
    // venue behind. Table numbers are also allocated in here, so two uploads
    // racing cannot derive the same MAX(number).
    let replacedImages: string[] = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      if (index === 0) {
        replacedImages = rows<{ image_path: string | null }>(
          db.prepare("SELECT image_path FROM rooms WHERE image_path IS NOT NULL").all()
        )
          .map((r) => r.image_path)
          .filter((p): p is string => Boolean(p));

        db.exec("DELETE FROM bookings");
        db.exec("DELETE FROM tables");
        db.exec("DELETE FROM rooms");
        db.exec("DELETE FROM venue");
        db.prepare("INSERT INTO venue (id, name) VALUES (1, ?)").run(venueName);
      }

      const base = (
        db.prepare("SELECT COALESCE(MAX(number), 0) AS n FROM tables").get() as { n: number }
      ).n;

      const info = db
        .prepare(
          `INSERT INTO rooms (name, sort_order, image_path, image_w, image_h, floor, is_outdoor)
           VALUES (?, ?, ?, 1000, 680, 'white-oak', 0)`
        )
        .run(roomName, index, `/uploads/${filename}`);
      const roomId = Number(info.lastInsertRowid);

      const ins = db.prepare(
        `INSERT INTO tables (room_id, number, seats, shape, x, y, w, h, rotation, area)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      );
      result.tables.forEach((t, i) => {
        ins.run(roomId, base + i + 1, t.seats, t.shape, t.x, t.y, t.w, t.h, t.area ?? null);
      });

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    // Only once the replacement is committed do the old images go.
    writtenPath = null;
    for (const old of replacedImages) {
      await discard(path.join(process.cwd(), "public", old.replace(/^\//, "")));
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
    // Never leave an orphaned upload behind when the write failed.
    if (writtenPath) await discard(writtenPath);
    const message = err instanceof Error ? err.message : "Extraction failed.";
    const status = message.includes("API key") || message.includes("API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
