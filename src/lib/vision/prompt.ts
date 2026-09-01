import type { ExtractedTable, TableShape } from "../types";

export const SHAPES: TableShape[] = ["round", "square", "rect", "booth", "bar"];

export const SYSTEM =
  "You read architectural restaurant floor plans and return the dining tables on them as structured data.";

export const PROMPT = `Identify every piece of CUSTOMER SEATING on this restaurant floor plan.

COORDINATE SYSTEM (most important):
- Normalised coordinates from 0 to 1, relative to the full image.
- (0,0) is the TOP-LEFT corner, (1,1) is the BOTTOM-RIGHT corner.
- x, y = the CENTRE point of the table.
- w, h = width and height as a fraction of the image. A table spanning a tenth
  of the image width has w = 0.1.
- Include the chairs in the footprint, not just the tabletop.

WHAT COUNTS AS A TABLE:
- Freestanding dining tables (round, square, rectangular).
- Booths and banquettes. One booth unit is one table, shape "booth".
- A run of stools along a counter or bar: group into ONE entry per seating run,
  shape "bar", seats = number of stools drawn.
- Outdoor and patio tables. Use the "area" field to distinguish zones
  (for example "main", "patio", "bar").

IGNORE COMPLETELY:
- The legend, key, title block, and any text such as "RESTAURANT EMERGENCY FLOOR PLAN".
- Dimension lines and measurement labels.
- Restrooms, sinks, toilets, kitchen equipment, service counters, host stands.
- Plants, fire extinguishers, fire alarms, first aid boxes, exit route arrows.
- Doors, windows, walls.

SHAPE, read from the tabletop outline, not from the chairs around it:
- A circle or ellipse is "round". Circular tables are common and are frequently
  mislabelled as square: if the outline has no corners, it is "round".
- A square-ish four-sided top is "square".
- A clearly elongated four-sided top is "rect".
- Do not default to "square". Look at each outline individually.

SEATS, the most error-prone field. Work table by table:
1. Count the individual chair or stool glyphs that touch, or sit immediately
   against, THIS table's edge.
2. Count each chair exactly once. A chair drawn between two tables belongs to
   the nearer one only.
3. Do NOT count chairs belonging to a neighbouring table, and do NOT estimate
   from the table's size when chairs are visible. If four chairs are drawn, the
   answer is 4, even if the table looks large enough for more.
4. Only when no chairs at all are drawn, infer from size: small round = 2,
   standard square = 4.
5. Re-count each table once before you answer. Seat counts that are double the
   real number are the single most common mistake; check that you have not
   counted any chair twice or included a neighbour's chairs.

NUMBERING: number tables 1, 2, 3... reading top-to-bottom then left-to-right.

Be thorough. Including a table the owner then deletes is much better than
missing one entirely.`;

/** JSON Schema shared by both providers. */
export const TABLE_SCHEMA = {
  type: "object",
  properties: {
    tables: {
      type: "array",
      description: "Every seating position found on the plan.",
      items: {
        type: "object",
        properties: {
          number: { type: "integer", description: "Table number, starting at 1." },
          seats: {
            type: "integer",
            description:
              "Number of chair glyphs actually drawn against this table's edge. Count each chair once and exclude neighbouring tables' chairs.",
          },
          shape: {
            type: "string",
            enum: SHAPES,
            description:
              "Tabletop outline: round for circles/ellipses, square for square tops, rect for elongated tops, booth for banquettes, bar for a counter run.",
          },
          x: { type: "number", description: "Centre X, 0..1 from the left edge." },
          y: { type: "number", description: "Centre Y, 0..1 from the top edge." },
          w: { type: "number", description: "Width as a fraction of the image." },
          h: { type: "number", description: "Height as a fraction of the image." },
          area: { type: "string", description: "Zone name, e.g. main, patio, bar." },
        },
        required: ["number", "seats", "shape", "x", "y", "w", "h"],
      },
    },
  },
  required: ["tables"],
} as const;

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Never trust model output straight into the database. Coordinates are clamped
 * on-canvas, sizes kept visible but sane, numbers forced unique.
 * `startNumber` lets a second or third room continue numbering from the first.
 */
export function normalise(raw: unknown, startNumber = 1): ExtractedTable[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  const out: ExtractedTable[] = [];
  let next = startNumber;

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;

    const x = clamp(t.x, 0, 1, NaN);
    const y = clamp(t.y, 0, 1, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const shape = SHAPES.includes(t.shape as TableShape) ? (t.shape as TableShape) : "round";

    let number = next;
    while (seen.has(number)) number++;
    seen.add(number);
    next = number + 1;

    out.push({
      number,
      seats: Math.round(clamp(t.seats, 1, 30, 2)),
      shape,
      x,
      y,
      w: clamp(t.w, 0.012, 0.5, 0.06),
      h: clamp(t.h, 0.012, 0.5, 0.06),
      rotation: 0,
      area: typeof t.area === "string" && t.area.trim() ? t.area.trim().slice(0, 40) : null,
    });
  }

  return out.sort((a, b) => a.number - b.number);
}

export type MediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ExtractOutcome {
  tables: ExtractedTable[];
  provider: string;
  model: string;
  costUSD: number;
}
