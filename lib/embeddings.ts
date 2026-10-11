import { GoogleGenAI } from "@google/genai";

/**
 * text-embedding-004 has been retired — the API now answers 404 for it. Its
 * replacement is gemini-embedding-001, which emits 3072 dimensions natively and
 * supports Matryoshka truncation down to 768, so the vector(768) column stays
 * as it is.
 *
 * Verified against this key: batching works, truncation returns 768.
 * gemini-embedding-2 is NOT a drop-in — it answered a 2-item batch with a single
 * embedding — so don't swap the model without re-checking that.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/** Must stay in sync with the `vector(768)` column on the jobs table. */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * gemini-embedding-001 accepts 2048 input tokens. 6000 characters of dense
 * technical prose lands comfortably under that, with room for the tokenizer to
 * disagree with the estimate.
 */
export const MAX_EMBED_CHARS = 6_000;

/**
 * Asymmetric retrieval: job postings are embedded as documents, resumes as
 * queries. Using the same task type for both measurably hurts ranking.
 */
export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export type EmbeddingErrorKind = "config" | "rate_limit" | "too_long" | "upstream" | "shape";

export class EmbeddingError extends Error {
  readonly kind: EmbeddingErrorKind;

  constructor(message: string, kind: EmbeddingErrorKind, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
    this.kind = kind;
  }
}

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cached) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError(
        "Missing GEMINI_API_KEY. Add it to .env.local (see .env.example).",
        "config",
      );
    }
    cached = new GoogleGenAI({ apiKey });
  }
  return cached;
}

/** Map whatever the SDK threw onto something the caller can branch on. */
function classify(error: unknown): EmbeddingError {
  if (error instanceof EmbeddingError) return error;

  const status = Number(
    (error as { status?: unknown; code?: unknown })?.status ??
      (error as { code?: unknown })?.code,
  );
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) {
    return new EmbeddingError("Gemini is rate-limiting embedding requests.", "rate_limit", {
      cause: error,
    });
  }
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return new EmbeddingError("Gemini rejected the API key. Check GEMINI_API_KEY.", "config", {
      cause: error,
    });
  }
  if (/token count|too many tokens|exceeds the maximum|input is too long/i.test(message)) {
    return new EmbeddingError("The text is longer than the model accepts.", "too_long", {
      cause: error,
    });
  }
  if (status === 404) {
    return new EmbeddingError(
      `${EMBEDDING_MODEL} is not available to this API key. Models get retired — list them at /v1beta/models.`,
      "config",
      { cause: error },
    );
  }
  return new EmbeddingError(`Gemini embedding request failed: ${message}`, "upstream", {
    cause: error,
  });
}

/**
 * Truncated Matryoshka embeddings come back un-normalized (measured: ~0.59 at
 * 768 dims), which Google's docs say to correct yourself. Cosine distance is
 * scale-invariant so pgvector's `<=>` doesn't care, but unit vectors keep the
 * numbers comparable and let you switch to inner product (`<#>`) later.
 */
function normalize(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? values.map((value) => value / magnitude) : values;
}

/**
 * Embed several strings in one request, so seeding the whole job list costs a
 * single call.
 */
export async function embedBatch(texts: string[], task: EmbeddingTask): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.some((text) => !text.trim())) {
    throw new EmbeddingError("Cannot embed an empty string.", "shape");
  }
  const oversized = texts.findIndex((text) => text.length > MAX_EMBED_CHARS);
  if (oversized !== -1) {
    throw new EmbeddingError(
      `Input ${oversized} is ${texts[oversized].length} characters; the limit is ${MAX_EMBED_CHARS}.`,
      "too_long",
    );
  }

  let embeddings;
  try {
    const response = await client().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
      config: { taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    embeddings = response.embeddings ?? [];
  } catch (error) {
    throw classify(error);
  }

  // Catches a model that quietly folds a batch into one vector.
  if (embeddings.length !== texts.length) {
    throw new EmbeddingError(
      `Asked ${EMBEDDING_MODEL} for ${texts.length} embeddings, got ${embeddings.length}.`,
      "shape",
    );
  }

  return embeddings.map((embedding, index) => {
    const values = embedding.values;
    if (!values?.length) {
      throw new EmbeddingError(`Embedding ${index} came back empty.`, "shape");
    }
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `${EMBEDDING_MODEL} returned ${values.length} dimensions, but jobs.embedding is vector(${EMBEDDING_DIMENSIONS}).`,
        "shape",
      );
    }
    return normalize(values);
  });
}

export async function embedText(text: string, task: EmbeddingTask): Promise<number[]> {
  const [vector] = await embedBatch([text], task);
  return vector;
}

/** Inputs per request. Small enough to stay well inside the per-call token budget. */
export const EMBED_CHUNK_SIZE = 5;

/** Pause between chunks, so a seed of 20+ jobs doesn't arrive as a burst. */
const PACING_MS = 400;

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries rate limits and transient upstream failures; everything else throws. */
async function withRetry<T>(
  run: () => Promise<T>,
  onRetry?: (attempt: number, waitMs: number, reason: string) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const retryable =
        error instanceof EmbeddingError &&
        (error.kind === "rate_limit" || error.kind === "upstream");

      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;

      // Exponential backoff with jitter, so parallel runs don't resynchronise.
      const wait = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 500;
      onRetry?.(attempt, Math.round(wait), (error as EmbeddingError).kind);
      await sleep(wait);
    }
  }
}

/**
 * Embed any number of texts, in chunks, with backoff. Use this for seeding;
 * `embedBatch` is the single-request primitive underneath.
 *
 * Order is preserved — the caller relies on index alignment with its input.
 */
export async function embedAll(
  texts: string[],
  task: EmbeddingTask,
  hooks?: {
    onChunk?: (done: number, total: number) => void;
    onRetry?: (attempt: number, waitMs: number, reason: string) => void;
  },
): Promise<number[][]> {
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBED_CHUNK_SIZE) {
    const chunk = texts.slice(start, start + EMBED_CHUNK_SIZE);
    const embedded = await withRetry(() => embedBatch(chunk, task), hooks?.onRetry);

    vectors.push(...embedded);
    hooks?.onChunk?.(vectors.length, texts.length);

    if (start + EMBED_CHUNK_SIZE < texts.length) await sleep(PACING_MS);
  }

  return vectors;
}
