import { PROMPT, SYSTEM, TABLE_SCHEMA, normalise } from "./prompt";
import type { ExtractOutcome, MediaType } from "./prompt";

/**
 * Gemini backend, called over plain REST so the project carries no extra
 * dependency. Gemini enforces the JSON shape server-side via responseSchema,
 * so the reply parses directly.
 */
// Verified available on a fresh AI Studio key; gemini-2.5-* is listed by the
// models endpoint but rejected for new users.
const DEFAULT_MODEL = "gemini-3.6-flash";

/** Gemini's schema dialect rejects some JSON Schema keywords; strip them. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return schema;
}

export async function extractWithGemini(
  base64: string,
  mediaType: MediaType,
  startNumber: number
): Promise<ExtractOutcome> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: mediaType, data: base64 } }, { text: PROMPT }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(TABLE_SCHEMA),
        temperature: 0,
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    let hint = "";
    if (res.status === 404) {
      hint = ` The model "${model}" was not found for your key. Set GEMINI_MODEL in .env.local to one your account has, for example gemini-3.6-flash or gemini-3.7-flash.`;
    } else if (res.status === 400 && detail.includes("API_KEY")) {
      hint = " That key looks invalid. Check GEMINI_API_KEY in .env.local.";
    } else if (res.status === 429) {
      hint = " Rate limit or free-tier quota reached. Wait a minute and retry.";
    }
    throw new Error(`Gemini returned ${res.status}.${hint}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidates.");
  if (candidate.finishReason === "SAFETY") {
    throw new Error("Gemini blocked this image. Try a different floor plan.");
  }

  const text = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response.");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error("Could not parse Gemini's response as JSON.");
    payload = JSON.parse(match[0]);
  }

  return {
    tables: normalise(payload.tables, startNumber),
    provider: "gemini",
    model,
    costUSD: 0, // free tier; paid usage is billed by Google, not tracked here
  };
}
