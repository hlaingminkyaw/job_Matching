import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { MAX_EMBED_CHARS, MAX_EMBED_TOKENS, countEmbedTokens } from "@/lib/embeddings";
import { OcrError, ocrAvailable, ocrPdf } from "@/lib/ocr";
import {
  MAX_EXTRACTED_CHARS,
  RESUME_MAX_BYTES,
  normalizeResumeText,
  resumeFileKind,
  stripMarkdown,
  type ResumeFileKind,
} from "@/lib/resume-text";

// pdf.js and mammoth are Node libraries — neither runs on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The OCR fallback takes ~5s on a one-page scan, which is over Vercel's 10s
 * default for a serverless function. Hobby caps this at 60s, Pro at 300s.
 */
export const maxDuration = 60;

/**
 * Error shape mirrors /api/match: `{ error: { code, message } }`, so the client
 * reads `payload.error.message` the same way everywhere.
 */
function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * A scan isn't always text-free: a footer, a watermark or a scanner stamp can
 * leave a handful of characters behind, which would otherwise come back as a
 * 200 holding a useless "resume". No real resume is this short, so treat
 * anything under this as the scan it almost certainly is, and let OCR try.
 * PDFs only — a .txt this short is something the user typed on purpose.
 */
const MIN_PDF_CHARS = 120;

/** How the text was recovered. Returned so the UI can say which. */
export type TextSource = "text-layer" | "ocr";

type Extraction = {
  /** Already normalized — the handler does not clean it again. */
  text: string;
  source: TextSource;
  /** The OCR model stopped at its token ceiling, so this is only the opening. */
  truncated: boolean;
};

/** Thrown by the extractors below; the handler turns it into a 400. */
class UnreadableFileError extends Error {
  /** The `error.code` the client sees. */
  readonly code: "unreadable_file" | "no_text";
  /** Whether an OCR pass could still rescue this file. */
  readonly ocrMayHelp: boolean;

  constructor(
    message: string,
    options?: {
      code?: "unreadable_file" | "no_text";
      ocrMayHelp?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "UnreadableFileError";
    this.code = options?.code ?? "unreadable_file";
    this.ocrMayHelp = options?.ocrMayHelp ?? false;
  }
}

/** What pdf.js can see. Empty or near-empty for a scan. */
async function extractPdfTextLayer(bytes: Uint8Array): Promise<string> {
  // Imported lazily: pdf-parse v2 pulls in pdf.js plus a native canvas binding,
  // and a .docx or .txt upload should not pay that cold-start cost.
  const { PDFParse } = await import("pdf-parse");

  // v2 is a rewrite — `new PDFParse({ data }).getText()`, not the v1 callable.
  //
  // The copy is load-bearing: pdf.js transfers the ArrayBuffer it is handed to
  // its worker, which leaves the caller's view detached — `bytes.length` is 0
  // once getText() resolves. readPdf needs the original afterwards to send to
  // OCR, and without this it would base64-encode nothing and Gemini would
  // answer 400 INVALID_ARGUMENT, so every scan failed as "no text".
  const parser = new PDFParse({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const result = await parser.getText();
    return result.text;
  } catch (error) {
    // The exception classes come from the dynamic import, so match on `name`
    // rather than dragging them in just for an instanceof.
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      // Gemini can't decrypt it either, so don't spend a call finding out.
      throw new UnreadableFileError(
        "That PDF is password-protected. Remove the password and upload it again.",
        { cause: error },
      );
    }
    if (name === "InvalidPDFException") {
      throw new UnreadableFileError(
        "That file isn't a readable PDF — it may be corrupt or only renamed to .pdf.",
        { cause: error },
      );
    }
    // A structural fault in an otherwise real PDF. pdf.js gives up on these,
    // but Gemini renders rather than parses, so it is worth the attempt.
    throw new UnreadableFileError("Could not read that PDF.", {
      ocrMayHelp: true,
      cause: error,
    });
  } finally {
    // Releases the pdf.js worker. Without it the process keeps one per upload.
    await parser.destroy().catch(() => {});
  }
}

/** The message for a scan that OCR could not rescue. */
function scanMessage(detail?: string): string {
  const base =
    "That PDF has almost no selectable text — it's probably a scan or an image export.";
  return detail ? `${base} ${detail}` : `${base} Paste the text instead.`;
}

function ocrFailureMessage(error: unknown): string {
  if (error instanceof OcrError) {
    if (error.kind === "unavailable") {
      return scanMessage("The OCR service is overloaded right now — try again in a minute, or paste the text instead.");
    }
    if (error.kind === "rate_limit") {
      return scanMessage("Reading it with OCR is rate-limited right now — try again in a moment, or paste the text instead.");
    }
    if (error.kind === "blocked") {
      return scanMessage("OCR declined to read it. Paste the text instead.");
    }
    // "config" is a deployment problem, not something the visitor can act on,
    // so it reads the same as no OCR at all. The cause is in the server log.
    return scanMessage();
  }
  return scanMessage();
}

/**
 * Text layer first, OCR second. The common case — a PDF exported from Word or
 * a design tool — never reaches Gemini, so it stays free and finishes in
 * milliseconds.
 */
async function readPdf(bytes: Uint8Array): Promise<Extraction> {
  let textLayer = "";
  try {
    textLayer = normalizeResumeText(await extractPdfTextLayer(bytes));
  } catch (error) {
    // Password-protected or not a PDF at all: OCR cannot help, so stop here.
    if (error instanceof UnreadableFileError && !error.ocrMayHelp) throw error;
    console.error("[parse-resume] pdf text layer failed, trying OCR:", error);
  }

  if (textLayer.length >= MIN_PDF_CHARS) {
    return { text: textLayer, source: "text-layer", truncated: false };
  }

  if (!ocrAvailable()) {
    throw new UnreadableFileError(scanMessage(), { code: "no_text" });
  }

  try {
    const result = await ocrPdf(bytes);
    // stripMarkdown only on this path: a text layer or a .docx carries whatever
    // the author typed, and an asterisk there is theirs to keep. Markdown in an
    // OCR result is the model's own embellishment, against instructions.
    const cleaned = normalizeResumeText(stripMarkdown(result.text));
    // A model that answers a blank page with a sentence of prose shouldn't
    // count as a resume either.
    if (cleaned.length < MIN_PDF_CHARS) {
      throw new OcrError("OCR returned too little to be a resume.", "empty");
    }
    return { text: cleaned, source: "ocr", truncated: result.truncated };
  } catch (error) {
    console.error("[parse-resume] OCR fallback failed:", error);
    throw new UnreadableFileError(ocrFailureMessage(error), {
      code: "no_text",
      cause: error,
    });
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    // mammoth terminates every paragraph with "\n\n", and in Word each line of a
    // resume is its own paragraph — so the raw output is double-spaced
    // throughout. Halving each run restores the original spacing: a normal line
    // break becomes one newline, a deliberately blank paragraph still becomes
    // two. Doing it here rather than in normalizeResumeText, which has no way to
    // know the convention came from mammoth.
    return value.replace(/\n{2,}/g, (run) => "\n".repeat(Math.ceil(run.length / 2)));
  } catch (error) {
    throw new UnreadableFileError(
      "Could not read that .docx. If it came from Word 97–2003, re-save it as .docx.",
      { cause: error },
    );
  }
}

function extractTxt(bytes: Uint8Array): string {
  // `fatal` so a mislabelled binary fails here instead of returning a page of
  // replacement characters that would then get embedded.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Latin-1 can't fail, and covers the CP-1252 files Windows editors produce.
    return new TextDecoder("latin1").decode(bytes);
  }
}

async function extract(kind: ResumeFileKind, bytes: Uint8Array): Promise<Extraction> {
  if (kind === "pdf") return readPdf(bytes);

  const raw = kind === "docx" ? await extractDocx(bytes) : extractTxt(bytes);
  return { text: normalizeResumeText(raw), source: "text-layer", truncated: false };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(
      400,
      "invalid_body",
      "Send the upload as multipart/form-data with the file under a `file` field.",
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "no_file", "No file came through. Attach one under the `file` field.");
  }

  // Size before type: a 40MB mislabelled file should be rejected on the cheap
  // check, not after it has been read into memory.
  //
  // RESUME_MAX_BYTES is set to Vercel's own body cap, so in practice a file
  // large enough to reach this branch on a deploy is one sitting right at the
  // boundary — the platform rejects anything past it before the route is
  // reached. Locally there is no such cap and this is the only check.
  if (file.size > RESUME_MAX_BYTES) {
    const limitMb = RESUME_MAX_BYTES / 1024 / 1024;
    const sizeMb = file.size / 1024 / 1024;
    return fail(
      413,
      "file_too_large",
      // A file a little over a fractional limit rounds to the limit itself, and
      // "That file is 4.5MB. The limit is 4.5MB." reads as a bug. Only quote the
      // size when it is far enough over to be a different number.
      sizeMb.toFixed(1) === limitMb.toFixed(1)
        ? `That file is just over the ${limitMb}MB limit.`
        : `That file is ${sizeMb.toFixed(1)}MB. The limit is ${limitMb}MB.`,
    );
  }
  if (file.size === 0) {
    return fail(400, "empty_file", "That file is empty.");
  }

  const kind = resumeFileKind(file.name, file.type);
  if (!kind) {
    const isLegacyDoc = /\.doc$/i.test(file.name);
    return fail(
      400,
      "unsupported_type",
      isLegacyDoc
        ? "Word 97–2003 .doc files aren't supported. Open it in Word and save as .docx."
        : "Upload a PDF, DOCX, or TXT file.",
    );
  }

  let extraction: Extraction;
  try {
    extraction = await extract(kind, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof UnreadableFileError) {
      console.error(`[parse-resume] ${kind} extraction failed:`, error.cause ?? error);
      return fail(400, error.code, error.message);
    }
    console.error("[parse-resume] unexpected failure:", error);
    return fail(500, "internal_error", "Something went wrong reading that file.");
  }

  // PDFs already cleared MIN_PDF_CHARS inside readPdf; this catches an empty
  // .docx or .txt.
  if (!extraction.text) {
    return fail(400, "no_text", "That file has no text in it.");
  }

  const overCeiling = extraction.text.length > MAX_EXTRACTED_CHARS;
  const text = overCeiling ? extraction.text.slice(0, MAX_EXTRACTED_CHARS) : extraction.text;

  // Ask the tokenizer the same question /api/match will ask, so the warning on
  // the drop zone and the verdict on the search agree. Counting here rather
  // than comparing character counts in the client: the client cannot import
  // lib/embeddings without dragging the Gemini SDK into the bundle, and a
  // character threshold is exactly the thing that was wrong before.
  //
  // `fits` is the verdict and is the only thing the client should branch on.
  // Null means genuinely unknown, which is not the same as "fine" — text past
  // MAX_EMBED_CHARS is known to be too long without asking anyone.
  let tokens: number | null = null;
  let fits: boolean | null = null;
  if (text.length > MAX_EMBED_CHARS) {
    fits = false;
  } else {
    try {
      tokens = await countEmbedTokens(text);
      fits = tokens <= MAX_EMBED_TOKENS;
    } catch (error) {
      // A failed count is not worth failing the upload over — the text is
      // already extracted, and /api/match reaches its own verdict regardless.
      console.error("[parse-resume] token count failed:", error);
    }
  }

  return NextResponse.json({
    text,
    name: file.name,
    kind,
    source: extraction.source,
    // The length of what's in `text`, not of what was extracted — the drop zone
    // prints this next to the textarea, so it has to match what landed there.
    // `truncated` is what says some of the file didn't make it.
    chars: text.length,
    truncated: overCeiling || extraction.truncated,
    // `tokens` is for display and is null when uncounted; `fits` is the verdict
    // and is null only when it is genuinely unknown.
    tokens,
    tokenLimit: MAX_EMBED_TOKENS,
    fits,
  });
}
