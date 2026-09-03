"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

interface Props {
  provider: string | null;
  onLoaded: () => void;
}

interface Pending {
  file: File;
  name: string;
}

const DEFAULT_NAMES = ["Main Floor", "Upstairs", "Patio"];
const MAX_ROOMS = 3;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default function UploadScreen({ provider, onLoaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [venue, setVenue] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [stepLabel, setStepLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Real elapsed time, so a long extraction never looks frozen.
  useEffect(() => {
    if (!running || finished) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running, finished]);

  /** Append rather than replace, so a second pick adds a second room. */
  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const incoming = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    if (incoming.length === 0) {
      setError("Those files are not images. Use PNG, JPEG, WEBP or GIF.");
      return;
    }
    setError(null);
    setPending((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (merged.length >= MAX_ROOMS) break;
        // Skip the same file picked twice.
        if (merged.some((p) => p.file.name === f.name && p.file.size === f.size)) continue;
        merged.push({ file: f, name: DEFAULT_NAMES[merged.length] ?? `Room ${merged.length + 1}` });
      }
      return merged;
    });
  }

  function removeAt(i: number) {
    setPending((prev) => prev.filter((_, n) => n !== i));
  }

  async function run() {
    setRunning(true);
    setError(null);
    setDone(0);

    for (let i = 0; i < pending.length; i++) {
      setStepLabel(`Reading ${pending[i].name}, image ${i + 1} of ${pending.length}`);
      const fd = new FormData();
      fd.append("file", pending[i].file);
      fd.append("name", pending[i].name);
      fd.append("index", String(i));
      fd.append("venue", venue.trim() || "My Restaurant");

      try {
        const res = await fetch("/api/layout/extract", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Extraction failed.");
          setRunning(false);
          return;
        }
        setDone(i + 1);
      } catch {
        setError("Upload failed. Check the dev server console.");
        setRunning(false);
        return;
      }
    }

    setStepLabel("Building your floor plan");
    setFinished(true);
    setTimeout(onLoaded, 620);
  }

  async function loadTemplate() {
    setRunning(true);
    setError(null);
    setStepLabel("Loading the demo venue");
    try {
      const res = await fetch("/api/layout/template", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setError(data.error ?? "Could not load the demo venue.");
        setRunning(false);
        return;
      }
    } catch {
      setError("Could not load the demo venue. Check the dev server console.");
      setRunning(false);
      return;
    }
    setFinished(true);
    setTimeout(onLoaded, 420);
  }

  const total = Math.max(pending.length, 1);
  const basePct = (done / total) * 100;
  const segmentPct = 100 / total;
  const atCapacity = pending.length >= MAX_ROOMS;

  return (
    <motion.div
      animate={{ opacity: finished ? 0 : 1 }}
      transition={{ duration: 0.42, ease: "easeOut" }}
      className="grid min-h-screen place-items-center p-8"
    >
      <div className="w-full max-w-xl">
        <p className="label">Table Booking</p>
        <h1 className="display mb-1 text-3xl">Build your floor plan</h1>
        <p className="mb-7 text-[var(--ink-muted)]">
          Upload up to three images, one per room or floor. Each becomes a page you can
          switch between.
        </p>

        {running ? (
          <div className="border border-[var(--line-strong)] bg-[var(--panel)] p-6">
            <p className="mb-3 text-sm">{stepLabel}</p>

            <div
              className="relative h-1.5 w-full overflow-hidden bg-[var(--panel-2)]"
              role="progressbar"
              aria-valuenow={finished ? 100 : Math.round(basePct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {/* Solid fill = images actually finished. */}
              <motion.div
                className="absolute inset-y-0 left-0 bg-[var(--brass)]"
                initial={{ width: 0 }}
                animate={{ width: finished ? "100%" : `${basePct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
              {/* Indeterminate sweep across the image being read right now, so
                  the bar always shows motion without faking a percentage. */}
              {!finished && (
                <div
                  className="absolute inset-y-0 overflow-hidden"
                  style={{ left: `${basePct}%`, width: `${segmentPct}%` }}
                >
                  <motion.div
                    className="h-full w-1/2 bg-[var(--brass)]"
                    style={{ opacity: 0.45 }}
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-[var(--ink-muted)]">
              {finished
                ? "Done"
                : `${done} of ${pending.length || 1} complete · ${elapsed}s elapsed · reading a plan takes 20 to 60 seconds`}
            </p>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!atCapacity) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className="border bg-[var(--panel)] p-6"
            style={{
              borderColor: dragOver ? "var(--brass)" : "var(--line-strong)",
              borderStyle: dragOver ? "dashed" : "solid",
            }}
          >
            <div className="mb-4">
              <label className="label" htmlFor="venue">Restaurant name</label>
              <input
                id="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Daily Bean"
                maxLength={60}
              />
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                // Reset so picking the same file again still fires onChange.
                e.target.value = "";
              }}
            />

            <button
              onClick={() => fileRef.current?.click()}
              className="btn w-full"
              disabled={!provider || atCapacity}
            >
              {pending.length === 0
                ? "Upload floor plan"
                : atCapacity
                  ? `Maximum of ${MAX_ROOMS} images added`
                  : "Add another image"}
            </button>

            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              {dragOver
                ? "Drop to add"
                : `Drag images here, or click above. PNG, JPEG, WEBP or GIF, up to ${MAX_ROOMS} images, 5MB each.`}
            </p>

            {pending.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
                {pending.map((p, i) => (
                  <li key={`${p.file.name}-${i}`} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                    <span className="truncate text-sm text-[var(--ink-muted)]" title={p.file.name}>
                      {p.file.name}
                    </span>
                    <input
                      aria-label={`Name for image ${i + 1}`}
                      value={p.name}
                      maxLength={40}
                      onChange={(e) => {
                        const next = [...pending];
                        next[i] = { ...next[i], name: e.target.value };
                        setPending(next);
                      }}
                    />
                    <button
                      onClick={() => removeAt(i)}
                      aria-label={`Remove ${p.file.name}`}
                      className="btn px-2 py-1 text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!provider && (
              <p className="mt-4 border border-[#7A6230] bg-[#2A2317] px-3 py-2 text-sm">
                No vision API key found. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to
                .env.local and restart the dev server. The demo venue below works without one.
              </p>
            )}

            <button
              onClick={run}
              disabled={pending.length === 0 || !provider}
              className="btn btn-primary mt-4 w-full"
            >
              {pending.length > 1
                ? `Generate floor plan from ${pending.length} images`
                : "Generate floor plan"}
            </button>

            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <button onClick={loadTemplate} className="text-sm underline">
                or load the demo venue, free and with no API key
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 border border-[#7A3B30] bg-[#2E1B17] px-3 py-2 text-sm">{error}</p>
        )}

        <p className="mt-6 text-xs text-[var(--ink-muted)]">
          <a href="/terms" className="underline">Terms</a>
          <span> and </span>
          <a href="/privacy" className="underline">Privacy</a>
        </p>
      </div>
    </motion.div>
  );
}
