# Table Booking

Upload a photo of your restaurant floor plan and get an interactive seating map
that takes reservations against it. Tables show green when free and red when
booked, and you can drag them around to match your real room.

## Try it with no setup

```bash
git clone https://github.com/AaryanKassam/Floor-Plan.git
cd Floor-Plan
npm install
npm run dev
```

Open http://localhost:3000 and click **load the demo venue**. That gives you a
full two room restaurant to click around in, and needs no API key at all.

Requires **Node 24 or newer** (`node -v`). The database is Node's built in
SQLite, so there is nothing else to install.

## Uploading your own floor plan

Reading a plan image is the one step that uses an AI model, and it runs once per
image. For that you need your own free Google Gemini key:

1. Get one at https://aistudio.google.com/apikey
2. `cp .env.local.example .env.local`
3. Put the key in it: `GEMINI_API_KEY=your-key-here`
4. Restart `npm run dev`

`.env.local` is gitignored, so your key stays on your machine and is only ever
read by the server, never sent to the browser.

**Why you need your own key.** Keys cannot be shared through a public repo. If
one were committed here, anyone could spend your quota, and Google scans public
repositories and automatically revokes keys it finds. If you want people to use
your key, host the app yourself (see below) rather than handing out the key.

An `ANTHROPIC_API_KEY` works instead, if you would rather use Claude. Gemini is
used when both are present.

## Using it

1. **Upload floor plan**, or drag images onto the box. Up to three, one per room
   or floor. Each becomes a page you switch between with the dots at the bottom.
2. The model finds the tables and their seat counts. It will not be perfect,
   which is what the editor is for.
3. **Click a table** to zoom into it and see or edit its number, seats and shape.
4. **Reserve a Seat**, top left, books a table: name, party size, time, date. The
   smallest free table that fits is chosen automatically, across every room.
5. **Edit layout**, top left, lets you drag tables around. Hold one against
   another for two seconds to join them into a run, or right click to uncombine.
6. **Settings**, bottom left, changes the floor material and table colours.
7. **Bookings**, top right, lists and cancels reservations.

## Putting it online

Deploy to Vercel and set `GEMINI_API_KEY` as an environment variable there. The
key lives on the server, visitors never see it, and nobody needs a key of their
own. This is the right way to let other people use yours.

Note that the SQLite file does not persist on Vercel. For a real deployment,
point Prisma or the queries in `src/lib/db.ts` at Postgres.

## Optional: mirror bookings to Google Sheets

Every confirmed reservation can be copied into a Google Sheet. The three minute
setup is in the comment at the top of `google-apps-script.gs`. Skip it and
bookings simply stay local.

## Tests

```bash
node scripts/layout.test.mts
```

Covers the table placement and combining geometry. Node runs TypeScript
directly, so there is no test framework to install.
