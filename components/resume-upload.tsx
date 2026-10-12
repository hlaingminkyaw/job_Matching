"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESUME_ACCEPT,
  RESUME_MAX_BYTES,
  formatBytes,
  resumeFileKind,
} from "@/lib/resume-text";

type Status = "idle" | "parsing" | "parsed";

type ParsedFile = {
  name: string;
  chars: number;
  /** Set when the extracted text is longer than the matcher will accept. */
  overLimit: boolean;
  truncated: boolean;
  /** True when the text came from OCR rather than a PDF's own text layer. */
  ocr: boolean;
  /** The opening of the extracted text — see `showFile` below. */
  signature: string;
};

type ResumeUploadProps = {
  /** The resume text currently in the textarea. */
  value: string;
  /** True while a match is in flight — don't let a new file land mid-search. */
  disabled: boolean;
  /** Called with the extracted text, or "" when the file is removed. */
  onText: (text: string) => void;
};

/** Enough of the extracted text to recognise it again, short enough to survive edits. */
const SIGNATURE_CHARS = 40;

export function ResumeUpload({ value, disabled, onText }: ResumeUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Parsing has run long enough that it must be the OCR path. */
  const [slow, setSlow] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  // dragenter/dragleave also fire for the zone's own children, so a plain
  // boolean flickers as the pointer crosses the icon. Count depth instead.
  const dragDepth = useRef(0);

  useEffect(() => {
    return () => inFlight.current?.abort();
  }, []);

  // A text-layer PDF comes back in milliseconds; a scan goes to Gemini and
  // takes about five seconds. Rather than leave a spinner unexplained, say so
  // once the wait is long enough to mean OCR is running.
  useEffect(() => {
    if (status !== "parsing") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 2_500);
    return () => clearTimeout(timer);
  }, [status]);

  // The chip claims the textarea holds this file's text, so it should only
  // stand while that is still true. Checking that the opening of the extracted
  // text is still in the box keeps the chip through ordinary edits, but drops
  // it when Clear or Load sample replaces the text outright. Derived rather
  // than synced, so there is no effect to fall out of step.
  const showFile =
    status === "parsing" ||
    (parsed !== null && parsed.signature !== "" && value.includes(parsed.signature));
  const file = showFile ? parsed : null;

  function reset() {
    inFlight.current?.abort();
    setStatus("idle");
    setParsed(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  /**
   * Rejected before it was ever sent. A resume already in the box stays there —
   * dropping the wrong file by mistake shouldn't cost the user the right one.
   */
  function rejectLocally(message: string) {
    if (inputRef.current) inputRef.current.value = "";
    setError(message);
  }

  async function upload(candidate: File) {
    if (disabled) return;

    // Checked here as well as in the route, so an obviously wrong file gives an
    // answer immediately instead of after a 5MB round trip.
    if (!resumeFileKind(candidate.name, candidate.type)) {
      rejectLocally(`${candidate.name} isn't a PDF, DOCX, or TXT file.`);
      return;
    }
    if (candidate.size > RESUME_MAX_BYTES) {
      rejectLocally(
        `${candidate.name} is ${formatBytes(candidate.size)} — over the ${formatBytes(RESUME_MAX_BYTES)} limit.`,
      );
      return;
    }

    // A second file supersedes the first; without this the slower response can
    // land last and overwrite the newer resume.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setError(null);
    setStatus("parsing");
    setParsed({
      name: candidate.name,
      chars: 0,
      overLimit: false,
      truncated: false,
      ocr: false,
      signature: "",
    });

    const body = new FormData();
    body.append("file", candidate);

    try {
      const response = await fetch("/api/parse-resume", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? `The parser returned ${response.status}. Try again.`,
        );
      }

      const text: string = payload?.text ?? "";
      if (!text.trim()) throw new Error("No text came back from that file.");

      setParsed({
        name: payload?.name ?? candidate.name,
        chars: payload?.chars ?? text.length,
        // The server's verdict, measured with the tokenizer rather than guessed
        // from a character count. Null means it could not tell, and an unproven
        // warning is worse than none.
        overLimit: payload?.fits === false,
        truncated: payload?.truncated === true,
        ocr: payload?.source === "ocr",
        signature: text.slice(0, SIGNATURE_CHARS),
      });
      setStatus("parsed");
      onText(text);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setStatus("idle");
      setParsed(null);
      setError(
        caught instanceof Error ? caught.message : "Could not read that file. Try another one.",
      );
    } finally {
      // Lets the same file be picked again after a failure — the input fires no
      // change event when the value is unchanged.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void upload(dropped);
  }

  return (
    <div className="mt-3">
      {file ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-raised px-3.5 py-2.5">
          <FileIcon parsing={status === "parsing"} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="text-[11px] text-muted tabular-nums">
              {status === "parsing" ? (
                slow ? (
                  "Still reading — a scanned PDF takes a few seconds…"
                ) : (
                  "Reading resume…"
                )
              ) : (
                <span className="text-brand">
                  Resume parsed successfully · {file.chars.toLocaleString()} characters
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              reset();
              onText("");
            }}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setDragging(false);
            }}
            onDrop={handleDrop}
            className={`flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed px-4 py-3.5 text-[13px] transition-[border-color,background-color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-40 ${
              dragging
                ? "border-line-brand bg-raised shadow-[0_0_0_3px_var(--brand-ring)]"
                : "border-line text-muted hover:border-line-strong hover:bg-raised hover:text-fg"
            }`}
          >
            <UploadIcon />
            <span>
              <span className="font-medium text-fg">
                {dragging ? "Drop to read it" : "Upload your resume"}
              </span>
              {/* The hint would contradict the drag state — "Drop to read it —
                  drag a file here" — so it only shows when nothing is in hand. */}
              {!dragging && (
                <span className="hidden sm:inline"> — drag a file here or click to browse</span>
              )}
            </span>
          </button>

          <p className="mt-2 text-center text-[11px] text-muted">
            PDF, DOCX, or TXT · up to {formatBytes(RESUME_MAX_BYTES)} · or just paste below
          </p>
        </>
      )}

      {/* Both alerts live outside the branch above: a rejected file leaves an
          already-parsed resume in place, so the chip and the error can show
          together. */}
      {file && status === "parsed" && file.ocr && (
        <Alert tone="warn">
          That PDF had no selectable text, so it was read with OCR. Give the text a quick look
          before searching.
        </Alert>
      )}

      {file && status === "parsed" && (file.overLimit || file.truncated) && (
        <Alert tone="warn">
          {file.truncated
            ? "That file was long enough that only the first part was kept. "
            : "That's longer than the matcher accepts. "}
          Trim the text below to the parts a hiring manager would read.
        </Alert>
      )}

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void upload(picked);
        }}
      />
    </div>
  );
}

function Alert({
  tone,
  onDismiss,
  children,
}: {
  tone: "error" | "warn";
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2.5 rounded-xl border border-solid-soft bg-solid-soft px-3.5 py-2.5 text-[12px] leading-5 text-solid"
    >
      <svg viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11.1" r="0.8" fill="currentColor" />
      </svg>
      <p className="flex-1">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss ${tone === "error" ? "error" : "warning"}`}
          className="-mr-1 shrink-0 rounded px-1 leading-none opacity-70 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M8 10.5V3m0 0L5.2 5.8M8 3l2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 10v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileIcon({ parsing }: { parsing: boolean }) {
  if (parsing) {
    return (
      <svg className="size-4 shrink-0 animate-spin text-brand" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-brand" fill="none" aria-hidden="true">
      <path
        d="M3.5 2.5h5l4 4v7a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.5 2.6V6.5h3.9" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
