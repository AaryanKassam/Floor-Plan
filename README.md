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
   A dot beside the seat count means the table is free right now but booked
   later that day: amber if that booking is more than an hour away, red if it is
   closer. Booking prefers a table with no dot, then an amber one, so clear
   tables stay clear and seatings are not packed back to back.
4. **Reserve a Seat**, top left, books a table: name, party size, time, date and
   an indoor/outdoor preference. The smallest free table that fits is chosen
   automatically, across every room. Past dates and times cannot be booked. If
   the preferred seating is full but the other kind is free, it asks whether to
   book that instead rather than seating the guest somewhere they did not pick.
5. **Bookings**, top right, lists reservations. **Edit** changes a booking's time
   or table, offering only tables that are actually free and large enough.
   **Cancel** asks to confirm, then removes it.
6. **Edit layout**, top left, lets you drag tables around. Hold one against
   another for two seconds to join them into a run, or right click to uncombine.
7. **Settings**, bottom left, changes the floor material and table colours, and
   marks a room as indoor or outdoor. Outdoor rooms show green on the room
   selector at the bottom of the screen.


## Optional: mirror bookings to a Google Sheet

Every confirmed reservation can be appended to a Google Sheet, and cancelling a
booking removes its row again. This is optional. Without it, bookings simply
stay in the local database.

**You connect your own spreadsheet.** Nothing is shared and there is no default
sheet: this repo ships no spreadsheet link and no credentials, so a fresh clone
writes nowhere until you point it at a sheet you own. Your bookings only ever
go to your sheet, and never to anyone else's.

It uses an Apps Script Web App bound to that sheet, so there is no Google Cloud
project, no service account and no JSON key file to manage.

**The script you need is already in this repo**, at `google-apps-script.gs` in
the project root. You do not write any code; you copy that file into Google's
editor. First, generate a secret and copy the script to your clipboard:

```bash
node -e "console.log(crypto.randomUUID())"   # your secret, copy the output
pbcopy < google-apps-script.gs               # macOS. Linux: xclip -sel clip < google-apps-script.gs
```

On Windows, or if those commands are not available, just open
`google-apps-script.gs` in your editor and copy all of it by hand.

1. Create or open the Google Sheet you want to use, then **Extensions >
   Apps Script** in its menu bar. A code editor opens in a new tab, with a
   file called `Code.gs` containing a stub `myFunction`.
2. Select everything in `Code.gs`, delete it, and paste in the whole of
   `google-apps-script.gs`.
3. Find the line `const SECRET = "";` near the top, around line 36, and put
   your generated secret between the quotes. **Keep the quotes**:
   `const SECRET = "1a82fd47-d0ab-4c0d-b805-7f3552801a40";`
   Left empty, the script rejects every request on purpose.
4. Save with the disk icon, or Ctrl+S / Cmd+S. Saving alone does not publish
   anything; the next step does.
5. **Deploy > New deployment**. Click the gear next to *Select type* and choose
   **Web app**. Set *Execute as* to **Me** and *Who has access* to **Anyone**,
   then **Deploy** and authorize it. Google warns that the app is unverified,
   because you just wrote it: choose **Advanced > Go to (project name)
   (unsafe) > Allow**. That warning is expected for your own script.
6. Copy the Web app URL, which ends in `/exec`. Put it in `.env.local` in the
   project root, creating that file from `.env.local.example` if you have not
   already:

   ```
   SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   SHEETS_TOKEN=the-same-secret-from-step-3
   ```

7. Restart `npm run dev`. Make a test booking, and check the **Bookings** tab
   of your sheet.

`SHEETS_TOKEN` must match `SECRET` exactly. They are the shared password
between your app and your script; requests without it are rejected, which is
why *Who has access: Anyone* is safe.

Rows go to a tab named **Bookings**, created automatically, with the columns
Booking ID, Name, Date, Time, Party Size, Table, Phone, Notes, Booked At.
Anything already in your spreadsheet is left alone. Booking ID is what a
cancellation matches on, which is how the right row gets removed.

Two things that catch people out:

- **`SECRET` must be quoted.** Without quotes the script throws and Google
  returns an HTML error page, so nothing is written.
- **Editing the script is not enough.** After any change you must go
  **Deploy > Manage deployments > pencil icon > Version: New version >
  Deploy**, or the old code keeps running at the same URL.

The sheet is a mirror, never the source of truth. If it cannot be reached, the
booking or cancellation still succeeds locally and the Bookings panel says the
sheet is out of step, rather than failing the reservation.
