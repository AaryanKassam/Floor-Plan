import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite via Node 24's built-in `node:sqlite` — no native dependency.
 * Cached on globalThis so Next's dev reloads reuse one connection.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tablebooking.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venue (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  name         TEXT NOT NULL DEFAULT 'My Restaurant',
  free_color   TEXT NOT NULL DEFAULT '#4A6B4F',
  booked_color TEXT NOT NULL DEFAULT '#8C3A2E',
  upload_session TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_path TEXT,
  image_w    INTEGER NOT NULL DEFAULT 1000,
  image_h    INTEGER NOT NULL DEFAULT 680,
  floor      TEXT    NOT NULL DEFAULT 'white-oak',
  is_outdoor INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id  INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  number   INTEGER NOT NULL UNIQUE,
  seats    INTEGER NOT NULL,
  shape    TEXT    NOT NULL DEFAULT 'round',
  x        REAL    NOT NULL,
  y        REAL    NOT NULL,
  w        REAL    NOT NULL DEFAULT 0.06,
  h        REAL    NOT NULL DEFAULT 0.06,
  rotation REAL    NOT NULL DEFAULT 0,
  area     TEXT,
  group_id INTEGER
);

CREATE TABLE IF NOT EXISTS bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id     INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  party_size   INTEGER NOT NULL,
  date         TEXT    NOT NULL,
  start_min    INTEGER NOT NULL,
  end_min      INTEGER NOT NULL,
  phone        TEXT,
  notes        TEXT,
  created_at   TEXT    NOT NULL,
  sheet_synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bookings_lookup ON bookings(date, table_id);
CREATE INDEX IF NOT EXISTS idx_tables_room ON tables(room_id);
`;

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // The single-room `layout` table predates multi-room support. There is no
  // production data to preserve, so drop the old shape rather than migrate it.
  const legacy = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='layout'")
    .get();
  if (legacy) {
    db.exec("DROP TABLE IF EXISTS bookings");
    db.exec("DROP TABLE IF EXISTS tables");
    db.exec("DROP TABLE IF EXISTS layout");
  }

  db.exec(SCHEMA);

  // Additive migration: databases created before seat colours existed still
  // have a two-column venue table. Adding columns preserves their data.
  const venueCols = (db.prepare("PRAGMA table_info(venue)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!venueCols.includes("free_color")) {
    db.exec("ALTER TABLE venue ADD COLUMN free_color TEXT NOT NULL DEFAULT '#4A6B4F'");
  }
  if (!venueCols.includes("booked_color")) {
    db.exec("ALTER TABLE venue ADD COLUMN booked_color TEXT NOT NULL DEFAULT '#8C3A2E'");
  }
  if (!venueCols.includes("upload_session")) {
    db.exec("ALTER TABLE venue ADD COLUMN upload_session TEXT");
  }

  const tableCols = (db.prepare("PRAGMA table_info(tables)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!tableCols.includes("group_id")) {
    db.exec("ALTER TABLE tables ADD COLUMN group_id INTEGER");
  }

  const roomCols = (db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!roomCols.includes("is_outdoor")) {
    db.exec("ALTER TABLE rooms ADD COLUMN is_outdoor INTEGER NOT NULL DEFAULT 0");
  }

  return db;
}

const g = globalThis as unknown as { __tbDb?: DatabaseSync };
export const db: DatabaseSync = g.__tbDb ?? (g.__tbDb = open());

/** node:sqlite returns null-prototype rows; normalise to plain objects. */
export function rows<T>(r: unknown[]): T[] {
  return r.map((x) => ({ ...(x as object) })) as T[];
}

export function row<T>(r: unknown): T | null {
  return r ? ({ ...(r as object) } as T) : null;
}

/** Replace the whole venue in one transaction. Used by upload and template. */
export function replaceVenue(
  venueName: string,
  roomsIn: {
    name: string;
    imagePath: string | null;
    floor: string;
    isOutdoor?: boolean;
    tables: Array<{ number: number; seats: number; shape: string; x: number; y: number; w: number; h: number; area: string | null }>;
  }[]
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM bookings");
    db.exec("DELETE FROM tables");
    db.exec("DELETE FROM rooms");
    db.exec("DELETE FROM venue");

    db.prepare("INSERT INTO venue (id, name) VALUES (1, ?)").run(venueName);

    const insRoom = db.prepare(
      "INSERT INTO rooms (name, sort_order, image_path, image_w, image_h, floor, is_outdoor) VALUES (?, ?, ?, 1000, 680, ?, ?)"
    );
    const insTable = db.prepare(
      `INSERT INTO tables (room_id, number, seats, shape, x, y, w, h, rotation, area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );

    roomsIn.forEach((r, i) => {
      const info = insRoom.run(r.name, i, r.imagePath, r.floor, r.isOutdoor ? 1 : 0);
      const roomId = Number(info.lastInsertRowid);
      for (const t of r.tables) {
        insTable.run(roomId, t.number, t.seats, t.shape, t.x, t.y, t.w, t.h, t.area);
      }
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
