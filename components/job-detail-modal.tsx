"use client";

import { useEffect, useRef, useState } from "react";
import { relativeDay } from "@/lib/format";
import { isSearchLink, jobSourceUrl, type Job } from "@/lib/jobs";
import type { JobMatch } from "@/lib/matching";
import { JobDescription } from "./job-description";
import { ScoreBadge, TIER_BAR } from "./score-badge";

type JobDetailModalProps = {
  match: JobMatch | null;
  /** Must be referentially stable — it is wired to the dialog's close event. */
  onClose: () => void;
};

/** "LinkedIn" / "Tech Career MM" / the bare hostname, for the source button. */
function sourceLabel(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("techcareerweb")) return "Tech Career MM";
    return host;
  } catch {
    return null;
  }
}

/**
 * Gmail's compose URL. It cannot carry an attachment, so the draft tells the
 * applicant to add their CV, and the UI repeats it under the button.
 */
function gmailComposeUrl(job: Job): string | null {
  if (!job.email) return null;

  const via = sourceLabel(jobSourceUrl(job));
  const subject = `Application for ${job.title} - [Your Name]`;
  const body = [
    `Dear Hiring Team at ${job.company},`,
    "",
    `I would like to apply for the ${job.title} position${via ? ` advertised on ${via}` : ""}.`,
    "",
    "[Two or three sentences on your experience and why you are a fit for this role.]",
    "",
    "My CV is attached. Thank you for your time and consideration.",
    "",
    "Best regards,",
    "[Your Name]",
    "[Phone] · [Email]",
  ].join("\n");

  // encodeURIComponent rather than URLSearchParams: the latter form-encodes
  // spaces as "+", which is ambiguous in a mail body.
  const query = [
    "view=cm",
    "fs=1",
    `to=${encodeURIComponent(job.email)}`,
    `su=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].join("&");
  return `https://mail.google.com/mail/?${query}`;
}

/**
 * Right-side drawer built on <dialog>, so Esc, focus trapping and making the
 * page behind it inert all come from the platform rather than from us.
 */
export function JobDetailModal({ match, onClose }: JobDetailModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Keep rendering the last job while the drawer slides out, otherwise the
  // content vanishes a beat before the panel does.
  const [shown, setShown] = useState<JobMatch | null>(match);
  useEffect(() => {
    if (match) setShown(match);
  }, [match]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (match && !dialog.open) dialog.showModal();
    if (!match && dialog.open) dialog.close();

    // showModal() blocks interaction behind the drawer but not scrolling.
    document.documentElement.style.overflow = match ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [match]);

  // Fires for Esc and for dialog.close() alike, so state stays in sync.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  const job = shown?.job;
  const gmailUrl = job ? gmailComposeUrl(job) : null;
  // Never the raw sourceUrl: a seeded row can carry a dead /jobs/<slug> path,
  // and a posting may carry no link at all. Both fall back to a live Myanmar
  // search rather than a 404 or a missing button.
  const sourceUrl = job ? jobSourceUrl(job) : null;
  const via = sourceLabel(sourceUrl ?? undefined);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="job-detail-title"
      // A click on the backdrop targets the dialog element itself.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {shown && job && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <ScoreBadge score={shown.score} tier={shown.tier} />
            <button
              type="button"
              onClick={onClose}
              className="-m-1.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-panel hover:text-fg"
              aria-label="Close job details"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <h2
              id="job-detail-title"
              className="text-xl font-semibold leading-snug tracking-[-0.015em]"
            >
              {job.title}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              <span className="font-medium text-fg">{job.company}</span>
              {job.location && (
                <>
                  <span aria-hidden="true"> · </span>
                  {job.location}
                </>
              )}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-4 text-sm">
              {job.salary && <Fact label="Salary" value={job.salary} numeric />}
              {job.level && <Fact label="Level" value={job.level} />}
              {job.employment && <Fact label="Type" value={job.employment} />}
              {relativeDay(job.postedAt) && (
                <Fact label="Posted" value={relativeDay(job.postedAt) as string} />
              )}
            </dl>

            {job.email && <ContactBlock email={job.email} />}

            <div className="mt-6">
              <JobDescription text={job.description} />
            </div>

            <section className="mt-8 rounded-xl border border-line bg-panel p-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
                Why this matches your resume
              </h3>

              <div
                className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line"
                role="img"
                aria-label={`Match score ${shown.score} out of 100`}
              >
                <div
                  className={`h-full rounded-full ${TIER_BAR[shown.tier]}`}
                  style={{ width: `${shown.score}%` }}
                />
              </div>

              <ul className="mt-4 flex flex-col gap-1.5">
                {shown.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2.5 text-sm leading-6">
                    <span
                      aria-hidden="true"
                      className="mt-[11px] size-1 shrink-0 rounded-full bg-line-strong"
                    />
                    <span className="min-w-0">{reason}</span>
                  </li>
                ))}
              </ul>

              {shown.matched.length > 0 && (
                <SkillGroup label="Found in your resume">
                  {shown.matched.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-medium"
                    >
                      {skill}
                    </li>
                  ))}
                </SkillGroup>
              )}

              {shown.gaps.length > 0 && (
                <SkillGroup label="Missing — worth adding">
                  {shown.gaps.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-xs text-muted"
                    >
                      {skill}
                    </li>
                  ))}
                </SkillGroup>
              )}
            </section>
          </div>

          <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              {gmailUrl && (
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
                >
                  Apply via Gmail
                  <ExternalIcon />
                </a>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:border-line-strong ${
                    gmailUrl ? "" : "flex-1"
                  }`}
                >
                  {isSearchLink(sourceUrl)
                    ? `Find similar roles${via ? ` on ${via}` : ""}`
                    : `View on ${via ?? "original post"}`}
                  <ExternalIcon />
                </a>
              )}
            </div>

            {gmailUrl ? (
              <p className="mt-2.5 text-center text-xs leading-5 text-muted">
                Opens a Gmail draft with the subject and body filled in. Attach your CV and
                replace the bracketed placeholders before sending.
              </p>
            ) : (
              // jobSourceUrl() always returns something, so there is always a
              // button — but with no address to apply to, say what it does.
              <p className="text-center text-sm text-muted">
                No contact address on this posting. The link opens current
                openings for this kind of role.
              </p>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}

function ContactBlock({ email }: { email: string }) {
  const addressRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function flash(next: "copied" | "manual") {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      flash("copied");
    } catch {
      // Blocked on insecure origins and in some in-app browsers. Select the
      // address so it can still be copied by hand.
      const node = addressRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      flash("manual");
    }
  }

  const label = state === "copied" ? "Copied" : state === "manual" ? "Press ⌘C" : "Copy email";

  return (
    <div className="mt-5 rounded-xl border border-line bg-panel p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
        Send your application to
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <a
          href={`mailto:${email}`}
          className="min-w-0 break-all font-mono text-sm underline-offset-4 hover:underline"
        >
          <span ref={addressRef}>{email}</span>
        </a>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-line bg-raised px-2.5 py-1 text-xs font-medium transition-colors hover:border-line-strong"
        >
          {label}
        </button>
        <span aria-live="polite" className="sr-only">
          {state === "copied" ? "Email address copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M6 3h7v7M13 3 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Fact({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className={`mt-0.5 ${numeric ? "tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

function SkillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-muted">{label}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{children}</ul>
    </div>
  );
}
