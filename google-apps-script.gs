/**
 * Apps Script Web App that appends reservations to your Google Sheet.
 *
 * SETUP (about 3 minutes, all in the browser — no Google Cloud project needed):
 *
 *  1. Open your sheet:
 *     https://docs.google.com/spreadsheets/d/1d2NG2yi2isIX6s9O-v8P5r_xD6zo7KxZhuVuxvhDZ_E/edit
 *  2. Extensions -> Apps Script. Delete the placeholder code.
 *  3. Paste this entire file in.
 *  4. Change SECRET below to any random string you invent.
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
 * If you ever edit this script, you must Deploy -> Manage deployments ->
 * pencil icon -> Version: New version -> Deploy, or the old code keeps running.
 */

const SECRET = "change-me-to-something-random";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.token !== SECRET) {
      return json({ ok: false, error: "bad token" });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Write a header row once, on an empty sheet.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Booking ID", "Name", "Date", "Time", "Party Size",
        "Table", "Phone", "Notes", "Created At",
      ]);
      sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
      sheet.setFrozenRows(1);
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
      body.createdAt,
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
