import { overlaps, isFree, findFreeSpot, clampInside, findCombineTarget, combinedPosition, sameGroup } from "../src/lib/layout.ts";

const VW = 1000, VH = 680;
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, extra); }
};

const box = (id: number, x: number, y: number, w = 0.09, h = 0.12) => ({ id, x, y, w, h });

console.log("overlap detection");
ok("identical boxes overlap", overlaps(box(1, .5, .5), box(2, .5, .5)));
ok("far apart do not overlap", !overlaps(box(1, .1, .1), box(2, .9, .9)));
ok("touching edges count as overlap (gap)", overlaps(box(1, .5, .5), box(2, .5 + 0.09, .5)));
ok("clearly separated do not", !overlaps(box(1, .3, .5), box(2, .5, .5)));

console.log("\nfindFreeSpot");
const others = [box(2, .5, .5), box(3, .6, .5), box(4, .4, .5)];

// Drop exactly on top of an existing table.
const spot = findFreeSpot(box(1, .5, .5), others, VW, VH);
ok("resolves a direct overlap", isFree({ ...box(1, .5, .5), ...spot }, others), JSON.stringify(spot));
ok("stays inside the room", spot.x >= 0 && spot.x <= 1 && spot.y >= 0 && spot.y <= 1, JSON.stringify(spot));
const dist = Math.hypot((spot.x - .5) * VW, (spot.y - .5) * VH);
ok("moves only as far as needed (<160 vb units)", dist < 160, `moved ${dist.toFixed(0)}`);

// A free drop point must not be moved at all.
const free = findFreeSpot(box(1, .15, .85), others, VW, VH);
ok("leaves a free drop point untouched", Math.abs(free.x - .15) < 1e-9 && Math.abs(free.y - .85) < 1e-9, JSON.stringify(free));

console.log("\nclamping at edges");
const edge = clampInside(box(1, -0.5, 1.4));
ok("clamps beyond top-left", edge.x >= 0.09 / 2 - 1e-9);
ok("clamps beyond bottom-right", edge.y <= 1 - 0.12 / 2 + 1e-9, JSON.stringify(edge));
const cornerDrop = findFreeSpot(box(1, 0, 0), others, VW, VH);
ok("corner drop stays on canvas", cornerDrop.x >= 0 && cornerDrop.y >= 0, JSON.stringify(cornerDrop));

console.log("\ncrowded room");
// A grid with one cell deliberately empty: the resolver must find that hole.
const HOLE = 9;
const grid = Array.from({ length: 24 }, (_, i) =>
  box(i + 10, 0.1 + (i % 6) * 0.16, 0.14 + Math.floor(i / 6) * 0.24)
).filter((_, i) => i !== HOLE);
const holePos = { x: 0.1 + (HOLE % 6) * 0.16, y: 0.14 + Math.floor(HOLE / 6) * 0.24 };

const found = findFreeSpot(box(1, .5, .38), grid, VW, VH);
ok("finds the one empty cell", isFree({ ...box(1, .5, .38), ...found }, grid), JSON.stringify(found));
const toHole = Math.hypot(found.x - holePos.x, found.y - holePos.y);
ok("lands near that hole", toHole < 0.12, `hole ${JSON.stringify(holePos)} got ${JSON.stringify(found)}`);

console.log("\nroom with no space at all");
const packed = Array.from({ length: 40 }, (_, i) =>
  box(i + 100, 0.08 + (i % 8) * 0.12, 0.1 + Math.floor(i / 8) * 0.2)
);
const noRoom = findFreeSpot(box(1, .5, .5), packed, VW, VH);
ok("degrades to a clamped in-bounds point", noRoom.x >= 0 && noRoom.x <= 1 && noRoom.y >= 0 && noRoom.y <= 1, JSON.stringify(noRoom));

console.log("\ncombining");
const anchor = { id: 50, x: 0.40, y: 0.50, w: 0.09, h: 0.12 };
const near   = { id: 51, x: 0.40 + 0.09 + 0.003, y: 0.505, w: 0.09, h: 0.12 };  // touching its right edge
const far    = { id: 52, x: 0.80, y: 0.50, w: 0.09, h: 0.12 };
const misaligned = { id: 53, x: 0.40 + 0.09 + 0.003, y: 0.80, w: 0.09, h: 0.12 };

const c1 = findCombineTarget(near, [anchor]);
ok("offers combine when edges are close and aligned", c1?.target.id === 50 && c1?.side === "right", JSON.stringify(c1));
ok("no combine when far away", findCombineTarget(far, [anchor]) === null);
// Previously 0.02 apart was enough to trigger; it must not be any more.
const nearbyNotTouching = { id: 54, x: 0.40 + 0.09 + 0.02, y: 0.50, w: 0.09, h: 0.12 };
ok("no combine when merely close but not touching", findCombineTarget(nearbyNotTouching, [anchor]) === null);
ok("no combine when vertically misaligned", findCombineTarget(misaligned, [anchor]) === null);

const placed = combinedPosition(near, c1!);
const seam = Math.abs(placed.x - anchor.x) - (near.w + anchor.w) / 2;
ok("combined tables sit flush", seam > 0 && seam < 0.005, `seam ${seam.toFixed(4)}`);
ok("combined tables share a centre line", Math.abs(placed.y - anchor.y) < 1e-9);

const leftSide = findCombineTarget({ ...near, x: 0.40 - 0.09 - 0.003 }, [anchor]);
ok("detects the left side too", leftSide?.side === "left", JSON.stringify(leftSide));

console.log("\ngrouped tables may touch");
const g1 = { id: 60, x: .5, y: .5, w: .09, h: .12, group: 7 };
const g2 = { id: 61, x: .5 + .092, y: .5, w: .09, h: .12, group: 7 };
const ungrouped = { ...g2, id: 62, group: null };
ok("same group is allowed to sit flush", isFree(g1, [g2]), "grouped pair reported as colliding");
ok("different group still collides", !isFree(g1, [ungrouped]));
ok("sameGroup ignores null groups", !sameGroup({ ...g1, group: null }, { ...g2, group: null }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
