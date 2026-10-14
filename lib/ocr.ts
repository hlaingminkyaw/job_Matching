import { GoogleGenAI } from "@google/genai";

/**
 * Gemini as an OCR fallback for PDFs with no usable text layer — a scan, a
 * phone photo exported to PDF, an image-only export from a design tool.
 * pdf-parse gets nothing from those because there is nothing to get.
 *
 * Only reached when the text layer comes up short, so the common upload still
 * costs nothing and returns in milliseconds.
 */

/**
 * Pinned, not an alias. Verified against this key on 2026-10-12:
 *
 *   gemini-1.5-flash  404 — the whole 1.5 series is gone
 *   gemini-2.5-flash  404 — "no longer available to new users", points here
 *   gemini-3.5-flash  5.0s, exact transcription  <- chosen
 *   gemini-flash-latest  10.4s, same output, but an alias that moves under you
 *   gemini-3.1-flash-lite  12.7s, same output — lite is not faster here
 *   gemini-3.8-flash  503, high demand
 *
 * When this one is retired it will answer 404 like the others. List what the
 * key can actually reach at /v1beta/models rather than guessing a successor.
 */
export const OCR_MODEL = "gemini-3.5-flash";

/**
 * Where OCR goes when OCR_MODEL is busy or rate-limited. A different model has
 * its own capacity pool, so it often answers while the primary is returning
 * 503 "high demand" — as it was on 2026-10-14, when gemini-3.5-flash and
 * gemini-flash-latest both 503'd and this one answered in about a second.
 * Slower than the primary on a resume (12.7s against 5.0s) but the same output.
 */
export const OCR_FALLBACK_MODEL = "gemini-3.1-flash-lite";

/**
 * Transcription needs no deliberation, and Gemini 3.x thinks by default:
 * measured 22.3s with thinking against 5.1s without, for byte-identical output
 * (681 thought tokens spent on reading a one-page resume).
 */
const THINKING_BUDGET = 0;

/** Roughly 60k characters of transcript — far beyond any real resume. */
const MAX_OUTPUT_TOKENS = 16_384;

/** Caps the wait on a pathological file rather than hanging the request. */
const OCR_TIMEOUT_MS = 60_000;

const PROMPT =
  "You are an OCR and document parser. Extract all resume text from this document " +
  "accurately, preserving structural sections (Summary, Experience, Skills, Education, " +
  "Contact). Do not add any conversational markdown or introductory notes, just the raw text.";

export type OcrErrorKind = "config" | "rate_limit" | "unavailable" | "blocked" | "empty" | "upstream";

export class OcrError extends Error {
  readonly kind: OcrErrorKind;

  constructor(message: string, kind: OcrErrorKind, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OcrError";
    this.kind = kind;
  }
}

export type OcrResult = {
  text: string;
  /** The model stopped at the token ceiling, so this is only the opening. */
  truncated: boolean;
};

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cached) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new OcrError("Missing GEMINI_API_KEY.", "config");
    }
    cached = new GoogleGenAI({ apiKey });
  }
  return cached;
}

/**
 * Whether OCR is worth attempting at all. Lets the caller fall back to its own
 * error instead of reporting an OCR failure on a deploy with no key set.
 */
export function ocrAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Map whatever the SDK threw onto something the caller can branch on. */
function classify(error: unknown): OcrError {
  if (error instanceof OcrError) return error;

  const status = Number(
    (error as { status?: unknown })?.status ?? (error as { code?: unknown })?.code,
  );
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) {
    return new OcrError("Gemini is rate-limiting OCR requests.", "rate_limit", { cause: error });
  }
  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(message)) {
    return new OcrError("Gemini is busy.", "unavailable", { cause: error });
  }
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return new OcrError("Gemini rejected the API key. Check GEMINI_API_KEY.", "config", {
      cause: error,
    });
  }
  if (status === 404) {
    return new OcrError(
      `${OCR_MODEL} is not available to this API key. Models get retired — list them at /v1beta/models.`,
      "config",
      { cause: error },
    );
  }
  return new OcrError(`Gemini OCR request failed: ${message}`, "upstream", { cause: error });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(model: string, base64: string): Promise<OcrResult> {
  const response = await client().models.generateContent({
    model,
    contents: [
      {
        role: "user",
        // Document first, instruction second — the order Google documents for a
        // single-file prompt, and the one these timings were measured with.
        parts: [{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: PROMPT }],
      },
    ],
    config: {
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      abortSignal: AbortSignal.timeout(OCR_TIMEOUT_MS),
    },
  });

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new OcrError(`Gemini declined to read the document (${blockReason}).`, "blocked");
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  const text = response.text ?? "";
  if (!text.trim()) {
    // A safety stop and an empty page both land here; finishReason separates them.
    throw new OcrError(
      finishReason && finishReason !== "STOP"
        ? `Gemini returned nothing (${finishReason}).`
        : "Gemini found no text in the document.",
      finishReason === "SAFETY" ? "blocked" : "empty",
    );
  }

  return { text, truncated: finishReason === "MAX_TOKENS" };
}

/**
 * Primary, then the fallback straight away (a different capacity pool, so no
 * point waiting first), then the fallback once more after a pause. Busy and
 * rate-limited answers come back in about a second, so the whole chain fits
 * well inside the route's 60s.
 */
const ATTEMPTS: { model: string; delayMs: number }[] = [
  { model: OCR_MODEL, delayMs: 0 },
  { model: OCR_FALLBACK_MODEL, delayMs: 0 },
  { model: OCR_FALLBACK_MODEL, delayMs: 1_500 },
];

/**
 * Transcribe a PDF that pdf-parse could not read. Moves down ATTEMPTS only on
 * the two failures that are purely about timing — a busy model and a rate
 * limit. Anything else (a bad key, a blocked document) throws immediately.
 *
 * Throws OcrError; the caller decides whether to surface it or fall back.
 */
export async function ocrPdf(bytes: Uint8Array): Promise<OcrResult> {
  const base64 = Buffer.from(bytes).toString("base64");
  let last: OcrError | undefined;

  for (const { model, delayMs } of ATTEMPTS) {
    if (delayMs) await sleep(delayMs);
    try {
      return await callGemini(model, base64);
    } catch (error) {
      last = classify(error);
      if (last.kind !== "rate_limit" && last.kind !== "unavailable") throw last;
      console.warn(`[ocr] ${model}: ${last.message} Trying the next model.`);
    }
  }

  throw last!;
}
