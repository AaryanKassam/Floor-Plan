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

    const text = await res.text();
    if (text.includes('"ok":true') || text.includes("OK")) return { synced: true };
    return { synced: false, reason: `Unexpected sheet response: ${text.slice(0, 120)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { synced: false, reason: msg };
  }
}
