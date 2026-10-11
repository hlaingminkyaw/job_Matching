import { MatchExplorer } from "@/components/match-explorer";

const PORTFOLIO_URL = "https://hmkportfolio.vercel.app/";

export default function Home() {
  return (
    <>
      {/* Fixed grid + glow orbs. Decorative, so hidden from assistive tech. */}
      <div className="ambience" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-6">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--brand-ring)]" aria-hidden="true" />
              <span className="text-sm font-medium tracking-[-0.01em]">Resume Match</span>
            </span>
            <span className="text-xs text-muted">
              by{" "}
              <a
                href={PORTFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 transition-colors hover:text-fg hover:underline"
              >
                Hlaing Min Kyaw
              </a>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[11px] text-muted backdrop-blur-md">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-brand badge-pulse" />
                <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
              </span>
              <span className="hidden sm:inline">Powered by </span>
              Gemini &amp; Supabase pgvector
            </span>

            {/* Icon-only, but the fictional-postings warning still has to reach
                a screen reader and a hovering mouse. */}
            <span
              title="Demo project — all postings are fictional"
              role="img"
              aria-label="Demo project — all postings are fictional"
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-muted backdrop-blur-md transition-colors hover:border-line-strong hover:text-fg"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 7.4v3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="8" cy="4.95" r="0.8" fill="currentColor" />
              </svg>
            </span>
          </div>
        </header>

        <div className="border-t border-line pt-10 pb-10">
          <h1 className="max-w-xl text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.022em] sm:text-[34px]">
            Find out which open roles actually fit your resume.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-7 text-muted">
            Every role gets scored on the skills it asks for, with the reasons spelled out —
            including what&apos;s missing.
          </p>
        </div>

        <MatchExplorer />

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-6 text-xs text-muted">
          <p>Fictional postings — not real listings.</p>
          <p>
            Built by{" "}
            <a
              href={PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-fg underline-offset-4 hover:underline"
            >
              Hlaing Min Kyaw
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
