import Anthropic from "@anthropic-ai/sdk";
import { PROMPT, SYSTEM, TABLE_SCHEMA, normalise } from "./prompt";
import type { ExtractOutcome, MediaType } from "./prompt";

const MODEL = "claude-opus-5";

export async function extractWithClaude(
  base64: string,
  mediaType: MediaType,
  startNumber: number
): Promise<ExtractOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic();

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    tools: [
      {
        name: "submit_layout",
        description: "Submit the tables extracted from the restaurant floor plan.",
        input_schema: TABLE_SCHEMA as unknown as Anthropic.Tool["input_schema"],
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: `${PROMPT}\n\nCall the submit_layout tool with your result.` },
        ],
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("Claude declined to process this image. Try a different floor plan.");
  }

  let payload: Record<string, unknown> | null = null;
  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === "submit_layout") {
      payload = block.input as Record<string, unknown>;
      break;
    }
  }

  if (!payload) {
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) {
      try {
        payload = JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
  }

  if (!payload) throw new Error("Could not read any tables from that image.");

  return {
    tables: normalise(payload.tables, startNumber),
    provider: "anthropic",
    model: MODEL,
    // Opus 5 list pricing: $5 / 1M input, $25 / 1M output.
    costUSD:
      (res.usage.input_tokens / 1_000_000) * 5 + (res.usage.output_tokens / 1_000_000) * 25,
  };
}
