# Table Booking

Upload a photo of your restaurant floor plan and get an interactive seating map
that takes reservations against it. Tables show green when free and red when
booked, and you can drag them around to match your real room.

## Try it with no setup

You need **Node 24 or newer**. Check with `node -v`. The database is Node's
built in SQLite, so there is nothing else to install.

```bash
git clone https://github.com/AaryanKassam/Floor-Plan.git
cd Floor-Plan
npm install
npm run dev
```

Open http://localhost:3000 and click **load the demo venue**. That gives you a
full two room restaurant to click around in, and needs no API key at all.

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
repositories and automatically revokes keys it finds. If you want other people
to use your key, deploy the app somewhere with the key set as a server
environment variable, rather than handing the key out.

An `ANTHROPIC_API_KEY` works instead, if you would rather use Claude. Gemini is
used when both are present.

**If an upload fails with a model error**, your Google account does not have the
default model. The message names the problem; fix it by adding a model your
account does have to `.env.local`:

```
GEMINI_MODEL=gemini-3.7-flash
```

Google rotates which models new keys can reach, so this is the most likely
first-run snag.

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

