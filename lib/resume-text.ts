/**
 * Upload rules and text cleanup, shared by the drop zone and /api/parse-resume.
 *
 * The client checks first so an obviously wrong file never costs a round trip;
 * the route checks again because anything can POST to it. Keep this module free
 * of server-only imports — it ships to the browser.
 */

/**
 * Matches the limit stated in the drop zone.
 *
 * 4.5MB because that is where Vercel caps a serverless request body. Anything
 * above it is rejected by the platform before the route runs, so the user would
 * get an opaque network error instead of the message in /api/parse-resume.
 * Resumes are far smaller than this; the ceiling is only here to stop someone
 * posting a film.
 */
export const RESUME_MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * Ceiling on extracted text. The matcher only takes MAX_EMBED_CHARS (6k), so a
 * 300-page PDF would just produce a payload nobody can use — cut it off well
 * above any real resume and tell the caller it was cut.
 */
export const MAX_EXTRACTED_CHARS = 100_000;

export type ResumeFileKind = "pdf" | "docx" | "txt";

const BY_EXTENSION: Record<string, ResumeFileKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
};

const BY_MIME: Record<string, ResumeFileKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/** The `accept` attribute for the file input. MIME types are there for mobile pickers. */
export const RESUME_ACCEPT = [...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`), ...Object.keys(BY_MIME)].join(",");

/**
 * Extension first: browsers disagree about the docx MIME type, and a drag from
 * some file managers arrives with `type` empty. MIME is only the fallback.
 */
export function resumeFileKind(name: string, mime?: string | null): ResumeFileKind | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? BY_MIME[(mime ?? "").toLowerCase().trim()] ?? null;
}

/** "248 KB" for the file chip, "4.5 MB" for the limit — but "2 MB", not "2.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Strip the markdown an OCR model adds on its own.
 *
 * lib/ocr.ts asks for raw text and gets `### EXPERIENCE` and
 * `* **Bachelor of Science**` back anyway — a prompt is a request, not a
 * guarantee, so the formatting comes off here where it can be relied on.
 *
 * Two reasons it matters beyond tidiness: the syntax is pure overhead against
 * the embedding model's token budget (~12% on a bullet-heavy resume), and
 * `**Laravel**` is not the token `Laravel`, so the asterisks dilute the very
 * terms the match is supposed to turn on.
 *
 * Deliberately conservative — it unwraps emphasis and drops line-leading
 * markers, and leaves anything it is not sure about alone. A stray asterisk in
 * body text is better than a mangled word.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // ### HEADING -> HEADING
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
      // * item / - item -> item. Nested indentation collapses with it.
      .replace(/^[ \t]*[-*+][ \t]+/gm, "")
      // > quote
      .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
      // --- / *** on their own line
      .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, "")
      // **bold** and __bold__, then *italic* and _italic_. Bold first so the
      // single-mark pass never meets a doubled one.
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
      .replace(/__(?=\S)([\s\S]*?\S)__/g, "$1")
      .replace(/(?<![*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1")
      // Underscores only when free-standing, so snake_case_names survive.
      .replace(/(?<![_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, "$1")
      // `code` and ```fences```
      .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      // [label](url) -> label (url), so a link's address is not lost
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
      .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
  );
}

/**
 * PDF and DOCX extraction both arrive messy: hard-wrapped lines padded out to
 * the column width, a blank line between every paragraph, soft hyphens left
 * over from justification, and non-breaking spaces Word inserts. None of that
 * survives into the embedding usefully, and it makes the textarea unreadable.
 *
 * Paragraph breaks are kept (collapsed to one blank line) because the matcher's
 * keyword pass reads section headings.
 */
export function normalizeResumeText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      // Control characters PDF text layers carry around. \n and \t stay.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/ /g, " ")
      // Soft hyphens and the zero-width family: invisible, but they split words
      // mid-token for the tokenizer.
      .replace(/[­​-‍﻿]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
