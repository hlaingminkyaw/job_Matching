"use client";

import type { FormEvent } from "react";
import { ResumeUpload } from "./resume-upload";

type ResumePanelProps = {
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onLoadSample: () => void;
  onClear: () => void;
};

export function ResumePanel({
  value,
  isLoading,
  onChange,
  onSubmit,
  onLoadSample,
  onClear,
}: ResumePanelProps) {
  const isEmpty = value.trim().length === 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-line bg-panel p-4 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset,0_20px_50px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-5"
      aria-busy={isLoading}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="resume" className="text-sm font-medium">
          Your resume
        </label>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={onLoadSample}
            className="text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            Load sample
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isEmpty}
            className="text-muted underline-offset-4 transition-colors hover:text-fg hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <ResumeUpload value={value} disabled={isLoading} onText={onChange} />

      <textarea
        id="resume"
        name="resume"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={10}
        spellCheck={false}
        placeholder="…or paste your resume here — experience, skills, projects. Plain text is fine."
        className="mt-3 w-full resize-y rounded-xl border border-line bg-raised px-3.5 py-3 font-mono text-[13px] leading-6 text-fg transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-ring)] focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted tabular-nums">
          {value.trim() ? `${value.trim().split(/\s+/).length} words` : "No resume yet"}
        </p>
        <button
          type="submit"
          disabled={isEmpty || isLoading}
          className="btn-brand inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? (
            <>
              <Spinner />
              Matching…
            </>
          ) : (
            "Find matching jobs"
          )}
        </button>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      className="size-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
