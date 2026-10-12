"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Telegram alert signup: a card under the results, and the modal it opens.
 *
 * The resume is passed down rather than re-entered — the person has already
 * typed it into the matcher, and asking for it twice is how a two-field form
 * becomes something nobody finishes.
 */

/**
 * Inlined at build time, so it must be referenced as a static property access
 * — process.env[name] would come out undefined in the browser.
 *
 * The fallback keeps the Start link working in a checkout where the var hasn't
 * been set yet. If you point this at a different bot, set the env var; editing
 * the fallback alone will send people to the wrong bot from a stale build.
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "mm_tech_job_alerts_bot";
const BOT_URL = `https://t.me/${BOT_USERNAME}`;

/**
 * On the 0-1 display-score scale — the same percentage the match badge shows.
 * Nothing below 0.5 is offered: the median resume×posting pair already scores
 * in the sixties, so a lower setting is a subscription to the entire feed.
 */
const THRESHOLDS = [
  { value: 0.65, label: "65% — cast a wide net" },
  { value: 0.75, label: "75% — solid fits only (recommended)" },
  { value: 0.85, label: "85% — the near-perfect ones" },
] as const;

type Status = "idle" | "submitting" | "done" | "error";

export function TelegramAlertCard({ resume }: { resume: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const hasResume = resume.trim().length > 0;

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">🔔 Get instant alerts on Telegram</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">
            We check Tech Career MM once a day. When a new posting scores highly against this
            resume, the bot messages you — with the score and the reasons.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!hasResume}
          className="btn-brand inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set up alerts
        </button>
      </div>

      {!hasResume && (
        <p className="mt-3 text-xs text-muted">
          Paste a resume above first — alerts are matched against it.
        </p>
      )}

      <TelegramAlertModal open={open} resume={resume} onClose={close} />
    </section>
  );
}

function TelegramAlertModal({
  open,
  resume,
  onClose,
}: {
  open: boolean;
  resume: string;
  /** Must be referentially stable — it is wired to the dialog's close event. */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const chatFieldId = useId();
  const scoreFieldId = useId();

  const [chatId, setChatId] = useState("");
  const [minScore, setMinScore] = useState<number>(0.75);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [welcomed, setWelcomed] = useState(true);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => inFlight.current?.abort();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    // showModal() blocks interaction behind the modal but not scrolling.
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  // Fires for Esc and for dialog.close() alike, so state stays in sync.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  async function subscribe() {
    const trimmed = chatId.trim();
    if (!trimmed || status === "submitting") return;

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: trimmed, resumeText: resume.trim(), minScore }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? `Subscribing returned ${response.status}. Try again.`,
        );
      }

      // Subscribed, but Telegram wouldn't take the confirmation. Saying so
      // beats "check Telegram!" when nothing is going to arrive.
      setWelcomed(payload?.welcomed !== false);
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={`${chatFieldId}-title`}
      // A click on the backdrop targets the dialog element itself.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={`${chatFieldId}-title`} className="text-base font-semibold tracking-[-0.01em]">
            {status === "done" ? "You're subscribed" : "Job alerts on Telegram"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-1.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-panel hover:text-fg"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {status === "done" ? (
            <div aria-live="polite">
              <p className="text-sm leading-6">
                {welcomed ? (
                  <>
                    The bot has sent you a confirmation — check Telegram. From now on you&apos;ll
                    get a message whenever a new posting scores{" "}
                    <span className="text-fg">{Math.round(minScore * 100)}%</span> or higher
                    against this resume.
                  </>
                ) : (
                  <>
                    Your subscription is saved, but the confirmation message didn&apos;t go
                    through. Open the bot and press <span className="text-fg">Start</span> so it
                    can reach you.
                  </>
                )}
              </p>
              <p className="mt-3 text-xs leading-5 text-muted">
                Send <code className="font-mono">/stop</code> to the bot at any time to turn
                alerts off.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                subscribe();
              }}
              aria-busy={status === "submitting"}
            >
              <Step number={1} title="Open the bot and press Start">
                <p className="text-sm leading-6 text-muted">
                  It replies with your Chat ID — a number you can tap to copy. A bot can&apos;t
                  message you until you&apos;ve started the chat, so this step is required.
                </p>
                <a
                  href={BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium transition-colors hover:border-line-strong"
                >
                  Open @{BOT_USERNAME}
                  <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
                    <path
                      d="M6 3h7v7M13 3 4 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </Step>

              <Step number={2} title="Paste the Chat ID here">
                <input
                  id={chatFieldId}
                  value={chatId}
                  onChange={(event) => setChatId(event.target.value)}
                  // Not type="number": chat IDs run to 19 digits, past what a
                  // number input handles exactly, and its spinner is nonsense
                  // for an identifier.
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. 123456789"
                  aria-label="Telegram Chat ID"
                  className="w-full rounded-xl border border-line bg-raised px-3.5 py-2.5 font-mono text-sm text-fg transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-ring)] focus:outline-none"
                />
              </Step>

              <Step number={3} title="Choose how picky to be" last>
                <select
                  id={scoreFieldId}
                  value={minScore}
                  onChange={(event) => setMinScore(Number(event.target.value))}
                  aria-label="Minimum match score"
                  className="w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-fg transition-colors focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-ring)] focus:outline-none"
                >
                  {THRESHOLDS.map((threshold) => (
                    <option key={threshold.value} value={threshold.value} className="bg-[#0b0c0e]">
                      {threshold.label}
                    </option>
                  ))}
                </select>
              </Step>

              {status === "error" && (
                <p role="alert" className="mt-4 text-sm leading-6 text-solid">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!chatId.trim() || status === "submitting"}
                className="btn-brand mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "submitting" ? "Subscribing…" : "Subscribe"}
              </button>

              {/* They are handing over a resume and a messaging ID. Saying
                  what happens to it belongs next to the button, not in a
                  policy page nobody opens. */}
              <p className="mt-3 text-xs leading-5 text-muted">
                Your resume is stored so new postings can be scored against it. Send{" "}
                <code className="font-mono">/stop</code> to the bot to switch alerts off.
              </p>
            </form>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Step({
  number,
  title,
  last,
  children,
}: {
  number: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "" : "mb-5"}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-brand bg-strong-soft text-[11px] font-semibold tabular-nums text-strong"
        >
          {number}
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="mt-2 pl-[1.9rem]">{children}</div>
    </div>
  );
}
