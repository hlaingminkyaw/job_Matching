"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobMatch } from "@/lib/matching";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { JobDetailModal } from "./job-detail-modal";
import { JobMatchCard } from "./job-match-card";
import { ResumePanel } from "./resume-panel";
import { ResultSkeleton } from "./result-skeleton";

type Status = "idle" | "loading" | "done" | "error";

export function MatchExplorer() {
  // Prefilled so there is something to search with; results wait for a click
  // rather than firing an embedding request on every page load.
  const [resume, setResume] = useState(SAMPLE_RESUME);
  const [results, setResults] = useState<JobMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<JobMatch | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Stable: the drawer binds this to the dialog's close event.
  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    return () => inFlight.current?.abort();
  }, []);

  async function findMatches() {
    const text = resume.trim();
    if (!text || status === "loading") return;

    // A second submit supersedes the first; without this the slower response
    // can land last and overwrite the newer results.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: text }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? `The matcher returned ${response.status}. Try again.`,
        );
      }

      setResults(payload?.matches ?? []);
      setSelected(null);
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reach the matcher. Check that the dev server is running.",
      );
      setStatus("error");
    }
  }

  function clear() {
    inFlight.current?.abort();
    setResume("");
    setResults([]);
    setSelected(null);
    setError(null);
    setStatus("idle");
  }

  const strongCount = results.filter((match) => match.tier === "strong").length;

  return (
    <div className="flex flex-col gap-8">
      <ResumePanel
        value={resume}
        isLoading={status === "loading"}
        onChange={setResume}
        onSubmit={findMatches}
        onLoadSample={() => setResume(SAMPLE_RESUME)}
        onClear={clear}
      />

      <section aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" && (
          <>
            <ResultsHeading>Embedding your resume and searching…</ResultsHeading>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((index) => (
                <ResultSkeleton key={index} />
              ))}
            </div>
          </>
        )}

        {status === "done" && results.length > 0 && (
          <>
            <ResultsHeading>
              {results.length} {results.length === 1 ? "role" : "roles"} ranked
              {strongCount > 0 && ` · ${strongCount} strong ${strongCount === 1 ? "fit" : "fits"}`}
            </ResultsHeading>
            <div className="flex flex-col gap-3">
              {results.map((match) => (
                <JobMatchCard
                  key={match.job.id}
                  match={match}
                  onOpen={() => setSelected(match)}
                />
              ))}
            </div>
          </>
        )}

        {status === "done" && results.length === 0 && (
          <Notice title="Nothing cleared the similarity threshold">
            No posting was close enough to this resume. Paste more of it, or lower{" "}
            <code className="font-mono text-[12px]">MATCH_THRESHOLD</code> in the match route.
          </Notice>
        )}

        {status === "error" && (
          <Notice title="Search failed" tone="error">
            {error}
            <button
              type="button"
              onClick={findMatches}
              className="mt-4 block rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:border-line-strong"
            >
              Try again
            </button>
          </Notice>
        )}

        {status === "idle" && (
          <Notice title="No matches yet">
            Upload or paste a resume above and hit{" "}
            <span className="text-fg">Find matching jobs</span> to search the postings in your
            database.
          </Notice>
        )}
      </section>

      <JobDetailModal match={selected} onClose={closeDetail} />
    </div>
  );
}

function ResultsHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
      {children}
    </h2>
  );
}

function Notice({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: "neutral" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed px-6 py-12 text-center ${
        tone === "error" ? "border-solid-soft" : "border-line"
      }`}
      role={tone === "error" ? "alert" : undefined}
    >
      <p className={`text-sm font-medium ${tone === "error" ? "text-solid" : ""}`}>{title}</p>
      <div className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted">{children}</div>
    </div>
  );
}
