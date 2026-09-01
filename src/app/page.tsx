"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import FloorPlan from "@/components/FloorPlan";
import UploadScreen from "@/components/UploadScreen";
import TableDetail from "@/components/TableDetail";
import ReservePanel from "@/components/ReservePanel";
import InfoPanel from "@/components/InfoPanel";
import RoomDots from "@/components/RoomDots";
import DateStrip from "@/components/DateStrip";
import SettingsPanel from "@/components/SettingsPanel";
import { label12h, slots, todayISO, toHHMM } from "@/lib/time";
import type { BookingRec, RoomRec, TableRec } from "@/lib/types";

/**
 * Room-to-room slide. Deliberately unhurried: at half this duration the plans
 * read as a cut rather than as one room being pushed aside by the next. The
 * curve eases in gently, holds a visible constant travel, then settles, which
 * is what makes it feel like a swipe rather than a slide transition.
 */
const SWIPE_SECONDS = 0.95;
const SWIPE_EASE = [0.38, 0.02, 0.16, 1] as const;

interface State {
  venue: { id: number; name: string; free_color: string; booked_color: string } | null;
  rooms: RoomRec[];
  tables: TableRec[];
  bookings: BookingRec[];
  date: string;
  sheetsConfigured: boolean;
  provider: string | null;
}

export default function Home() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<State | null>(null);
  const [date, setDate] = useState(todayISO());
  const [viewMin, setViewMin] = useState(18 * 60);
  const [roomIndex, setRoomIndex] = useState(0);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Pending positions while in edit mode, keyed by table id. Never written to
  // the server until Save, so Cancel is a genuine discard.
  const [draft, setDraft] = useState<
    Record<number, { x: number; y: number; group_id: number | null }>
  >({});
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  // Which way the next room transition should travel: 1 for a later room, -1
  // for an earlier one, so the plan slides the way the dots imply.
  const [dir, setDir] = useState(1);

  const load = useCallback(async (d: string) => {
    const res = await fetch(`/api/state?date=${d}`, { cache: "no-store" });
    setState(await res.json());
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  // Escape steps back out of the zoom, then closes panels.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (editing) { setEditing(false); setDraft({}); }
      else if (focusedId !== null) setFocusedId(null);
      else if (reserveOpen) setReserveOpen(false);
      else if (infoOpen) setInfoOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, reserveOpen, infoOpen, settingsOpen, editing, menu]);

  const occupancy = useMemo(() => {
    const m = new Map<number, BookingRec>();
    if (!state) return m;
    for (const b of state.bookings) {
      if (b.start_min <= viewMin && b.end_min > viewMin) m.set(b.table_id, b);
    }
    return m;
  }, [state, viewMin]);

  if (!state) {
    return (
      <div className="grid min-h-screen place-items-center text-[var(--ink-muted)]">
        <div className="w-56">
          <div className="h-1.5 w-full overflow-hidden bg-[var(--panel-2)]">
            <motion.div
              className="h-full w-1/3 bg-[var(--line-strong)]"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (state.rooms.length === 0) {
    return <UploadScreen provider={state.provider} onLoaded={() => void load(date)} />;
  }

  const room = state.rooms[Math.min(roomIndex, state.rooms.length - 1)];
  const roomTables = state.tables
    .filter((t) => t.room_id === room.id)
    .map((t) => (draft[t.id] ? { ...t, ...draft[t.id] } : t));
  const focused = roomTables.find((t) => t.id === focusedId) ?? null;
  const freeCount = roomTables.length - roomTables.filter((t) => occupancy.has(t.id)).length;

  async function saveLayout() {
    const positions = Object.entries(draft).map(([id, p]) => ({
      id: Number(id),
      x: p.x,
      y: p.y,
      groupId: p.group_id,
    }));
    if (positions.length > 0) {
      setSaving(true);
      await fetch("/api/tables/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      setSaving(false);
    }
    setDraft({});
    setEditing(false);
    setMenu(null);
    await load(date);
  }

  /**
   * Break a table out of its combined run. A group of one is meaningless, so
   * the last remaining partner is released too.
   */
  function uncombine(tableId: number) {
    const target = roomTables.find((t) => t.id === tableId);
    setMenu(null);
    if (!target || target.group_id == null) return;

    const siblings = roomTables.filter(
      (t) => t.group_id === target.group_id && t.id !== tableId
    );
    const updates = [{ id: target.id, x: target.x, y: target.y, group: null as number | null }];
    if (siblings.length === 1) {
      updates.push({ id: siblings[0].id, x: siblings[0].x, y: siblings[0].y, group: null });
    }
    setDraft((d) => {
      const next = { ...d };
      for (const u of updates) next[u.id] = { x: u.x, y: u.y, group_id: u.group };
      return next;
    });
  }

  function startEditing() {
    setFocusedId(null);
    setReserveOpen(false);
    setInfoOpen(false);
    setSettingsOpen(false);
    setEditing(true);
  }

  const freeColor = state.venue?.free_color ?? "#4A6B4F";
  const bookedColor = state.venue?.booked_color ?? "#8C3A2E";

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={
        {
          "--seat-free": freeColor,
          "--seat-booked": bookedColor,
        } as React.CSSProperties
      }
    >
      {/* The plan owns the screen. Everything else floats over it. */}
      <motion.div
        className="absolute inset-0 pt-16 pb-24 px-[clamp(12px,3vw,40px)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        {/* Rooms slide past each other. The stage clips at the plan's own
            bounds so the outgoing room never spills over the controls. */}
        <div className="relative h-full w-full overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <motion.div
              key={room.id}
              custom={dir}
              className="absolute inset-0"
              variants={{
                enter: (d: number) => ({ x: reduce ? 0 : `${d * 100}%`, opacity: reduce ? 0 : 1 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: reduce ? 0 : `${d * -100}%`, opacity: reduce ? 0 : 1 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                reduce
                  ? { duration: 0.12 }
                  : { duration: SWIPE_SECONDS, ease: SWIPE_EASE }
              }
            >
              <FloorPlan
                room={room}
                tables={roomTables}
                occupancy={occupancy}
                focusedId={focusedId}
                onFocus={setFocusedId}
                editing={editing}
                onContextMenu={(id, x, y) => setMenu({ id, x, y })}
                onChange={(updates) =>
                  setDraft((d) => {
                    const next = { ...d };
                    for (const u of updates) next[u.id] = { x: u.x, y: u.y, group_id: u.group };
                    return next;
                  })
                }
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Top left */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        {editing ? (
          <>
            <button onClick={saveLayout} disabled={saving} className="btn btn-primary pointer-events-auto">
              {saving ? "Saving" : "Save layout"}
            </button>
            <button
              onClick={() => { setEditing(false); setDraft({}); }}
              className="btn pointer-events-auto"
            >
              Cancel
            </button>
          </>
        ) : focused ? (
          <button onClick={() => setFocusedId(null)} className="btn pointer-events-auto">
            Back to floor
          </button>
        ) : (
          <>
            <button
              onClick={() => { setReserveOpen((v) => !v); setInfoOpen(false); }}
              className="btn btn-primary pointer-events-auto"
              aria-expanded={reserveOpen}
            >
              Reserve a Seat
            </button>
            <button onClick={startEditing} className="btn pointer-events-auto">
              Edit layout
            </button>
          </>
        )}
      </div>

      {/* Top centre: what the plan is showing */}
      {editing && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
          <p className="border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm">
            Drag tables to rearrange. Hold one against another for two seconds to
            combine them. Right click a table to uncombine.
          </p>
        </div>
      )}

      {!focused && !editing && (
        <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3">
          <div className="pointer-events-auto">
            <DateStrip date={date} side="before" onPick={setDate} />
          </div>
          <div className="pointer-events-auto flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5">
            <span className="display whitespace-nowrap text-sm">{state.venue?.name}</span>
            <span className="text-[var(--line-strong)]">|</span>
            <input
              aria-label="Date shown"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[135px] border-0 bg-transparent p-0 text-sm"
            />
            <select
              aria-label="Time shown"
              value={toHHMM(viewMin)}
              onChange={(e) => setViewMin(Number(e.target.value.slice(0, 2)) * 60 + Number(e.target.value.slice(3)))}
              className="w-[120px] border-0 bg-transparent p-0 text-sm"
            >
              {slots().map((s) => (
                <option key={s} value={toHHMM(s)}>{label12h(s)}</option>
              ))}
            </select>
            <span className="text-[var(--line-strong)]">|</span>
            <span className="whitespace-nowrap text-sm text-[var(--ink-muted)]">{freeCount} free</span>
          </div>
          <div className="pointer-events-auto">
            <DateStrip date={date} side="after" onPick={setDate} />
          </div>
        </div>
      )}

      {/* Top right */}
      {menu && (() => {
        const t = roomTables.find((x) => x.id === menu.id);
        const combined = t?.group_id != null;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div
              role="menu"
              className="fixed z-50 min-w-[168px] border border-[var(--line-strong)] bg-[var(--panel)] p-1"
              style={{ left: menu.x, top: menu.y }}
            >
              <p className="px-2 py-1 text-[11px] uppercase tracking-[0.09em] text-[var(--ink-muted)]">
                Table {t?.number}
              </p>
              <button
                role="menuitem"
                onClick={() => uncombine(menu.id)}
                disabled={!combined}
                className="block w-full px-2 py-1.5 text-left text-sm disabled:opacity-40"
                style={{ background: "transparent" }}
              >
                {combined ? "Uncombine" : "Not combined"}
              </button>
            </div>
          </>
        );
      })()}

      <div className="pointer-events-none absolute right-4 top-4" hidden={editing}>
        <button
          onClick={() => { setInfoOpen((v) => !v); setReserveOpen(false); }}
          className="btn pointer-events-auto"
          aria-expanded={infoOpen}
        >
          {infoOpen ? "Hide bookings" : "Bookings"}
        </button>
      </div>

      {/* Bottom: room switcher, or the focused table's detail */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-3">
        <AnimatePresence mode="wait">
          {focused ? (
            <TableDetail
              key={focused.id}
              table={focused}
              booking={occupancy.get(focused.id)}
              onSaved={() => void load(date)}
              onBack={() => setFocusedId(null)}
            />
          ) : state.rooms.length > 1 ? (
            <motion.div
              key="dots"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto border border-[var(--line)] bg-[var(--panel)] px-4 py-2"
            >
              <RoomDots
                rooms={state.rooms}
                index={roomIndex}
                onChange={(i) => {
                  if (i === roomIndex) return;
                  setDir(i > roomIndex ? 1 : -1);
                  setRoomIndex(i);
                  setFocusedId(null);
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Side panels */}
      <div className="pointer-events-none absolute left-4 top-16 bottom-16">
        <AnimatePresence>
          {reserveOpen && !focused && (
            <ReservePanel
              date={date}
              onBooked={() => void load(date)}
              onClose={() => setReserveOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Settings: app-icon sized launcher, bottom left. */}
      {!focused && !editing && (
        <div className="absolute bottom-5 left-4 flex items-end gap-3">
          <button
            onClick={() => { setSettingsOpen((v) => !v); setReserveOpen(false); }}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            title="Settings"
            className="grid h-14 w-14 shrink-0 place-items-center border border-[var(--line-strong)] bg-[var(--panel)]"
            style={{ background: settingsOpen ? "var(--panel-2)" : "var(--panel)" }}
          >
            {/* Hand-drawn slider glyph; no icon library. */}
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <g stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round">
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </g>
              <g fill="var(--brass)" stroke="var(--panel)" strokeWidth="1.6">
                <circle cx="9" cy="7" r="3" />
                <circle cx="16" cy="12" r="3" />
                <circle cx="7" cy="17" r="3" />
              </g>
            </svg>
          </button>

          <AnimatePresence>
            {settingsOpen && (
              <SettingsPanel
                room={room}
                freeColor={freeColor}
                bookedColor={bookedColor}
                onChanged={() => void load(date)}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="pointer-events-none absolute right-4 top-16 bottom-16 flex">
        <AnimatePresence>
          {infoOpen && (
            <InfoPanel
              date={date}
              bookings={state.bookings}
              tables={state.tables}
              sheetsConfigured={state.sheetsConfigured}
              onChanged={() => void load(date)}
              onClose={() => setInfoOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
