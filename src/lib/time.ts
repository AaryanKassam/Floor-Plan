/** Service window and slot granularity for the whole app. */
export const OPEN_MIN = 11 * 60; // 11:00
export const CLOSE_MIN = 22 * 60; // 22:00
export const SLOT_STEP = 30; // minutes between bookable slots
export const DEFAULT_DURATION = 90; // how long a party holds a table

export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Bad time "${hhmm}", expected HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Bad time "${hhmm}"`);
  return h * 60 + min;
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function label12h(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function slots(): number[] {
  const out: number[] = [];
  for (let t = OPEN_MIN; t <= CLOSE_MIN - SLOT_STEP; t += SLOT_STEP) out.push(t);
  return out;
}

/** YYYY-MM-DD in the machine's local timezone (not UTC — avoids off-by-one). */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/* ---------- Calendar helpers for the date strip ---------- */

/** Parse YYYY-MM-DD as a LOCAL date. `new Date(iso)` parses as UTC and can
 *  land on the previous day west of Greenwich. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function dayOfMonth(iso: string): number {
  return parseISO(iso).getDate();
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseISO(iso).getDay()];
}

export function isWeekend(iso: string): boolean {
  const day = parseISO(iso).getDay();
  return day === 0 || day === 6;
}

/**
 * A booking closer than this to the slot in question counts as "soon": it
 * drives both the red/amber table markers and the booking tie-break. Lives
 * here rather than in assign.ts so client components can import it without
 * pulling node:sqlite into the browser bundle.
 */
export const SOON_MINUTES = 60;

/** Minutes from midnight, right now, in local time. */
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** True when this date and time has already passed. */
export function isPast(dateISO: string, startMin: number): boolean {
  const today = todayISO();
  if (dateISO < today) return true;
  if (dateISO > today) return false;
  return startMin < nowMin();
}
