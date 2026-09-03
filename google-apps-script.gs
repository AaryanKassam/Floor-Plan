/**
 * Apps Script Web App that appends reservations to your Google Sheet.
 *
 * SETUP (about 3 minutes, all in the browser — no Google Cloud project needed):
 *
 *  1. Open your sheet:
 *     https://docs.google.com/spreadsheets/d/1d2NG2yi2isIX6s9O-v8P5r_xD6zo7KxZhuVuxvhDZ_E/edit
 *  2. Extensions -> Apps Script. Delete the placeholder code.
 *  3. Paste this entire file in.
 *  4. Set SECRET below to any random string you invent, in quotes.
 *     Left empty, the script rejects everything.
 *  5. Save (disk icon), then Deploy -> New deployment.
 *       - Click the gear next to "Select type" and choose "Web app"
 *       - Description:  table booking
 *       - Execute as:   Me
 *       - Who has access: Anyone            <- required; the SECRET is the real guard
 *     Deploy -> Authorize access -> pick your Google account.
 *     Google will warn "Google hasn't verified this app" because you just wrote
 *     it: click Advanced -> "Go to <project name> (unsafe)" -> Allow.
 *  6. Copy the Web app URL (ends in /exec).
 *  7. In your project's .env.local put:
 *       SHEETS_WEBHOOK_URL=<that /exec URL>
 *       SHEETS_TOKEN=<the same SECRET you set below>
 *  8. Restart `npm run dev`.
 *
 * Rows go to a tab named "Bookings", created automatically. Anything already
 * in your spreadsheet is left alone.
 *
 * If you ever edit this script, you must Deploy -> Manage deployments ->
 * pencil icon -> Version: New version -> Deploy, or the old code keeps running.
 */

// Leave empty and the script refuses every request. The old placeholder was
// published in this repo, so a deployment that never changed it would have
// accepted writes from anyone who found the URL.
const SECRET = "";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (!SECRET || SECRET === "change-me-to-something-random") {
      return json({ ok: false, error: "SECRET is not configured in the Apps Script." });
    }
    if (body.token !== SECRET) {
      return json({ ok: false, error: "bad token" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Cancelling a booking in the app removes its row here too.
    if (body.action === "delete") {
      const sh = ss.getSheetByName("Bookings");
      if (!sh || sh.getLastRow() < 2) return json({ ok: true, deleted: 0 });
      const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
      for (let r = ids.length - 1; r >= 1; r--) {
        if (String(ids[r][0]) === String(body.id)) {
          sh.deleteRow(r + 1);
          return json({ ok: true, deleted: 1 });
        }
      }
      return json({ ok: true, deleted: 0 });
    }

    // Bookings go on their own tab. Using the first sheet meant rows landed
    // among whatever was already there (old n8n rows, for instance) with
    // mismatched columns and no headers.
    const HEADERS = [
      "Booking ID", "Name", "Date", "Time", "Party Size",
      "Table", "Phone", "Notes", "Booked At",
    ];
    let sheet = ss.getSheetByName("Bookings");
    if (!sheet) sheet = ss.insertSheet("Bookings");

    // Ensure headers exist, not only when the sheet is brand new.
    if (sheet.getRange(1, 1).getValue() !== HEADERS[0]) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    // The app sends UTC. Show it in the spreadsheet's own timezone instead of
    // a raw ISO string, which reads like a second reservation date.
    let bookedAt = body.createdAt;
    try {
      bookedAt = Utilities.formatDate(
        new Date(body.createdAt),
        ss.getSpreadsheetTimeZone(),
        "yyyy-MM-dd h:mm a"
      );
    } catch (e) {
      // Keep the raw value if the date cannot be parsed.
    }

    sheet.appendRow([
      body.id,
      body.name,
      body.date,
      body.time,
      body.partySize,
      body.tableNumber,
      body.phone || "",
      body.notes || "",
      bookedAt,
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
