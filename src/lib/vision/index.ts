import { extractWithGemini } from "./gemini";
import { extractWithClaude } from "./anthropic";
import type { ExtractOutcome, MediaType } from "./prompt";

export type { ExtractOutcome, MediaType } from "./prompt";
export type Provider = "gemini" | "anthropic";

/**
 * Provider is chosen by which key is present, so a fork of this repo works with
 * whichever the owner has. GEMINI_API_KEY wins when both are set: it is the
 * cheaper default for people cloning from GitHub. Override with VISION_PROVIDER.
 */
export function activeProvider(): Provider | null {
  const forced = process.env.VISION_PROVIDER as Provider | undefined;
  if (forced === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forced === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export async function extractTables(
  base64: string,
  mediaType: MediaType,
  startNumber = 1
): Promise<ExtractOutcome> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error(
      "No vision API key found. Add GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY to .env.local, then restart the dev server."
    );
  }
  const result =
    provider === "gemini"
      ? await extractWithGemini(base64, mediaType, startNumber)
      : await extractWithClaude(base64, mediaType, startNumber);

  // An image with no detectable tables must not be treated as a successful
  // extraction: the caller resets the venue on success, so returning an empty
  // room here would silently destroy a working layout.
  if (result.tables.length === 0) {
    throw new Error(
      "No tables were detected in that image. Try a clearer or higher-resolution floor plan."
    );
  }

  return result;
}
