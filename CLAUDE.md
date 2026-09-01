# Table Booking — working notes

## Invariants (do not break these)

1. **Table assignment never calls an LLM.** `src/lib/assign.ts` decides
   availability with a SQL predicate inside a `BEGIN IMMEDIATE` transaction.
   This is what makes concurrent double-booking impossible. Verified: 10
   simultaneous requests for a party only one table could hold produced exactly
   1 confirmation and 9 rejections.

2. **The LLM is called in exactly one place**: `src/lib/vision/`, once per
   uploaded room image. Gemini and Anthropic backends are interchangeable and
   selected by which key is present. If a feature seems to need a second LLM
   call, question it first.

3. **Coordinates are normalised 0..1** relative to the plan image, with x/y as
   the table CENTRE. Never store pixels — the layout must survive rescaling.

4. **The Google Sheet is a mirror, not the source of truth.** `sheets.ts` is
   best-effort; a sync failure must never fail a booking.

5. **`ANTHROPIC_API_KEY` is server-only.** Never prefix it `NEXT_PUBLIC_`.

## Stack notes

- SQLite through Node 24's built-in `node:sqlite` — deliberately not
  `better-sqlite3`, to avoid a native build step.
- Model output is always run through `normalise()` in `vision.ts` before it
  touches the database.

6. **The zoom camera animates the SVG `viewBox`.** Never switch it to a CSS
   transform on a group: `transform-box` defaults to the group bbox and the
   planks extend past the viewBox, which throws the origin off-canvas.

7. **Base CSS must live in `@layer base` / `@layer components`.** Unlayered CSS
   beats Tailwind v4's layered utilities regardless of specificity. An unlayered
   `select { width: 100% }` silently defeated `w-[120px]`, and
   `button { border-radius }` squared off `rounded-full` on the date chips.
   Both bugs looked like Tailwind not working; neither was.

8. **Seat colours are venue-wide and restricted to the palette** in
   `src/lib/palette.ts`. They are applied by overriding the `--seat-free` /
   `--seat-booked` custom properties on the page root, so the SVG picks them up
   without prop drilling. Do not accept arbitrary hex from the client.

9. **Never re-add a focus outline to the SVG table groups.** Chrome draws
   `outline: auto` (5px, rgb(0,95,204)) on a focused SVG <g> even when
   `:focus-visible` is FALSE, so a plain mouse click drew a blue box around the
   table. `.table-hit:focus { outline: none }` suppresses it; keyboard focus is
   shown by a brass stroke on `.table-shape` via `:focus-visible`, which does
   match when tabbing. Verified both paths.

10. **Extraction runs BEFORE the destructive reset** in
    `src/app/api/layout/extract/route.ts`, and a zero-table result throws in
    `src/lib/vision/index.ts`. Both guard the same failure: the route wipes the
    venue when `index === 0`, so a failed or empty extraction used to leave an
    empty venue named "My Restaurant" behind with no way back.

11. **Edit-mode collision uses an ASYMMETRIC gap** (`DEFAULT_GAP` in
    `src/lib/layout.ts`): y is ~3.5x x, because each table draws its seat count
    ~27 viewBox units below its shape. Shape-only spacing passes a geometric
    test and still looks collided on screen.

12. **Combining is horizontal only**, by design (`findCombineTarget` in
    `src/lib/layout.ts`). Each table draws its seat count ~27 units BELOW its
    shape, so tables stacked flush vertically would put the upper one's label
    on the lower one. Side-by-side also matches how tables are really joined.
    Combined tables share a `group_id` and are exempt from collision with each
    other, so they stay flush on later drags.

13. **Follow the design ban list** in `~/.claude/.../memory/design-ban-list.md`.
   No shadows, no soft radii, no Inter/Geist/Space Grotesk, no emojis, no hover
   animations, no pure white. It overrides design-tool recommendations.

## Not yet done

- Neither vision backend has been run against a real image. The Gemini endpoint,
  header and body shape were verified against the live API (it rejected only the
  dummy key), and the Anthropic path typechecks against SDK 0.122.0, but the
  first real upload is still the true test.
- No auth, no multi-venue. Single venue enforced by `venue.id = 1`.
- Rooms cannot be reordered or renamed after upload except via the API.
