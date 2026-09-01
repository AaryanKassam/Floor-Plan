# Table Booking

Upload a restaurant floor plan, get an interactive seating map, take reservations
against it, and mirror every booking into a Google Sheet.

## Where the AI is (and isn't)

Claude is called in exactly **one** place: `src/lib/vision.ts`, which turns an
uploaded floor plan image into table coordinates. That runs **once per floor
plan**, costs roughly 5¢, and never runs again.

Everything else — which table a party gets, whether a slot is free, the green/red
rendering — is deterministic code in `src/lib/assign.ts`. Availability is a SQL
predicate evaluated inside a `BEGIN IMMEDIATE` transaction, so two people booking
the same second cannot both win. No language model can hallucinate a free table.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then add your key
npm run dev
```

Open http://localhost:3000.

### Vision API key

You need ONE of these in **`.env.local`**. Gemini has a free tier and is the
default when both are present, which is what keeps this repo cheap to fork:

```
GEMINI_API_KEY=...        # https://aistudio.google.com/apikey
# GEMINI_MODEL=gemini-2.5-pro    # optional, overrides the default
```

or, alternatively:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Renaming one variable to the other does **not** switch providers. They are
different endpoints with different request shapes; `src/lib/vision/` holds a
backend for each and picks one by which key is present.

Why this is safe:

- `.env.local` is listed in `.gitignore`, so it never reaches git.
- The key is read only inside `src/lib/vision.ts`, which runs in a route handler
  on the server. Next.js only exposes environment variables to the browser when
  they are prefixed `NEXT_PUBLIC_` — **never rename it to that.**
- The browser talks to `/api/layout/extract`; the image goes to your own server,
  and your server talks to Anthropic. The key never leaves your machine.

Restart `npm run dev` after editing `.env.local` — env vars load at boot.

### Google Sheets sync (optional)

Bookings work fine without this; they just stay local. To mirror them into
[your sheet](https://docs.google.com/spreadsheets/d/1d2NG2yi2isIX6s9O-v8P5r_xD6zo7KxZhuVuxvhDZ_E/edit),
follow the numbered setup comment at the top of **`google-apps-script.gs`**.

It uses an Apps Script Web App rather than the Sheets REST API deliberately: no
Google Cloud project, no service account, no JSON key file on disk. You need a
URL and a shared secret.

The sheet is a **mirror, not the source of truth**. If it's unreachable the
reservation still succeeds and is flagged "not synced" in the sidebar.

## Using it

1. **Upload floor plan**, up to three images, one per room or floor. Or click
   *load the demo venue* to try it with no key at all.
2. The model reads each plan and places the tables, with a progress bar that
   advances per completed image. Detection will not be perfect; that is what the
   editor is for.
3. **Click any table.** The map zooms into it, the rest of the room fades out,
   and a panel opens below with the booking details and the seat/number/shape
   editor. *Back to floor*, or the Escape key, zooms back out.
4. **Reserve a Seat**, top left: name, party size, time, date. Best-fit
   assignment picks the smallest free table that fits, across every room.
5. That table turns **red** with an **i** badge. Change the time in the top bar
   to see the room at other hours.
6. **Bookings**, top right, toggles the side panel, which also holds the floor
   material picker for the current room.
7. With more than one room, a dot control at the bottom switches between them.
8. **Date chips** either side of the top bar jump three days back or forward.
   Weekends show as cream. Clicking one re-centres the strip on that date.
9. **Edit layout**, top left, makes tables draggable. Drop one on another and
   it settles into the nearest free space rather than stacking. Drag one
   alongside another and a *Combine* prompt appears: dropping there joins them
   flush into a run, each keeping its own number, seat count and border.
   Dragging a table back out again un-joins it. *Save layout* writes the
   positions; *Cancel* or Escape discards them.
10. **Settings**, bottom left, changes the floor material for the current room
   and the free/booked table colours for the whole venue. It also holds
   *Upload a new floor plan*, which clears the venue and returns you to the
   upload screen. That is destructive and asks for confirmation first.

## Layout

```
src/lib/assign.ts     Deterministic assignment + transaction. The core.
src/lib/vision/       The only LLM calls. gemini.ts and anthropic.ts are
                      interchangeable; index.ts picks by which key is set.
src/lib/floors.ts     Procedural wood/concrete recipes.
src/lib/db.ts         SQLite via Node 24's built-in node:sqlite (no native deps).
src/lib/sheets.ts     Best-effort Apps Script sync.
src/lib/template.ts   Hard-coded demo layout, no API key required.
src/components/       FloorPlan (SVG + viewBox camera), Floor (procedural
                      material), TableDetail, ReservePanel, InfoPanel, RoomDots.
src/app/api/          Route handlers.
data/                 SQLite file. Gitignored.
public/uploads/       Uploaded plans. Gitignored.
```

Table coordinates are stored **normalised 0..1** relative to the plan image, never
in pixels — so the layout survives any screen size, zoom level, or image rescale.

## Notes

- Service window is 11:00–22:00 in 30-minute slots; a party holds a table for 90
  minutes. All four constants are at the top of `src/lib/time.ts`.
- SQLite is single-file and fine for one restaurant. For multi-restaurant, move to
  Postgres — the transaction logic in `assign.ts` carries over unchanged.

## Design notes

Two things worth knowing before editing the UI.

**The zoom camera animates the SVG `viewBox`, not a CSS transform.** A transform
on the group was tried first and sent the room off-screen: `transform-box`
defaults to the group's bounding box, and the floor planks deliberately extend
past the viewBox, so the origin landed off-canvas. The viewBox is defined in
user units, so the framing is exact.

**Floor realism comes from three stacked cues**, not one texture: planks of
varying length with staggered butt joints, per-plank lightness jitter, and a
stretched `feTurbulence` grain overlay. A uniform plank grid reads as fake
immediately. Everything is procedural SVG, so there are no texture images to
ship.

Depth comes from 1px borders rather than shadows, corners stay at 2px, and hover
is an instant colour change with no transition.

## Tests

`src/lib/layout.ts` is pure geometry and is covered by a runnable suite (Node 24
executes TypeScript directly, no test framework needed):

```bash
node scripts/layout.test.mts
```
