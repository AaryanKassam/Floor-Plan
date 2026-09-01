/**
 * Google Sheets sync via an Apps Script Web App bound to the sheet.
 *
 * Deliberately NOT the Google Sheets REST API: that needs a Google Cloud
 * project, a service account and a JSON key file. An Apps Script deployment is
 * a URL plus a shared secret, and the script already runs as the sheet's owner.
 *
 * Sync is best-effort. A booking is confirmed by our database, never by the
 * spreadsheet — if the sheet is unreachable the reservation still stands and is
 * flagged unsynced so it can be replayed.
 */

export interface SheetRow {
  id: number;
  name: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SyncOutcome {
  synced: boolean;
  reason?: string;
}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.SHEETS_WEBHOOK_URL);
}

export async function appendBooking(rowData: SheetRow): Promise<SyncOutcome> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return { synced: false, reason: "SHEETS_WEBHOOK_URL not set" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: process.env.SHEETS_TOKEN ?? "", ...rowData }),
      signal: AbortSignal.timeout(8000),
      redirect: "follow", // Apps Script 302s to script.googleusercontent.com
    });

    if (!res.ok) return { synced: false, reason: `Sheet responded ${res.status}` };
    return readReply(await res.text());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { synced: false, reason: msg };
  }
}

/**
 * Apps Script answers a thrown error with an HTML page and HTTP 200, so the
 * status alone proves nothing. Parse strictly, and dig the real message out of
 * the HTML when it is not JSON: a substring check for "OK" would happily pass
 * on an error page, and the raw HTML tells the operator nothing.
 */
function readReply(text: string): SyncOutcome {
  try {
    const data = JSON.parse(text) as { ok?: boolean; error?: string };
    if (data.ok) return { synced: true };
    return { synced: false, reason: data.error ?? "Sheet rejected the row." };
  } catch {
    // Not JSON. Apps Script renders "Error <message> (line N, file "Code")".
    const stripped = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    // Take a window starting at the word "Error" rather than a lazy regex,
    // which matched only the word itself and threw the message away.
    const at = stripped.indexOf("Error");
    const detail = (at >= 0 ? stripped.slice(at) : stripped).slice(0, 180);
    return {
      synced: false,
      reason: detail ? `Apps Script error: ${detail}` : "Sheet returned a non-JSON response.",
    };
  }
}

/** Remove a booking's row from the sheet. Best effort, like appending. */
export async function deleteBooking(id: number): Promise<SyncOutcome> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return { synced: false, reason: "SHEETS_WEBHOOK_URL not set" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: process.env.SHEETS_TOKEN ?? "", action: "delete", id }),
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return { synced: false, reason: `Sheet responded ${res.status}` };

    const text = await res.text();
    const outcome = readReply(text);
    if (!outcome.synced) return outcome;

    // An older deployment has no delete branch: it answers {"ok":true} and
    // silently appends instead. Treat a missing `deleted` count as a failure,
    // otherwise the app reports success while the row is still in the sheet.
    try {
      const data = JSON.parse(text) as { deleted?: number };
      if (typeof data.deleted !== "number") {
        return {
          synced: false,
          reason:
            "The deployed Apps Script is an older version without the delete handler. Re-paste google-apps-script.gs, then Deploy > Manage deployments > edit > Version: New version.",
        };
      }
      if (data.deleted === 0) {
        return { synced: false, reason: "No matching row found in the sheet." };
      }
    } catch {
      return { synced: false, reason: "Sheet returned a non-JSON response." };
    }

    return { synced: true };
  } catch (err) {
    return { synced: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
