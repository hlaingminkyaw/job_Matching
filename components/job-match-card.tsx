import { relativeDay } from "@/lib/format";
import type { JobMatch } from "@/lib/matching";
import { leadParagraph } from "./job-description";
import { ScoreBadge, TIER_BAR } from "./score-badge";

type JobMatchCardProps = {
  match: JobMatch;
  onOpen: () => void;
};

export function JobMatchCard({ match, onOpen }: JobMatchCardProps) {
  const { job, score, tier, matched, gaps, reasons } = match;

  // Supabase rows only carry these once the display columns exist.
  const posted = relativeDay(job.postedAt);
  const footnotes = [job.level, job.employment, posted && `Posted ${posted}`].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <article className="group relative cursor-pointer rounded-xl border border-line bg-raised p-5 transition-colors hover:border-line-strong has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.011em]">
            {/* The stretched pseudo-element makes the whole card the hit area
                while keeping one real, focusable control for the keyboard. */}
            <button
              type="button"
              onClick={onOpen}
              className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4"
            >
              {job.title}
              <span className="sr-only"> — open details</span>
            </button>
          </h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-fg">{job.company}</span>
            {job.location && (
              <>
                <span aria-hidden="true"> · </span>
                {job.location}
              </>
            )}
            {job.salary && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="tabular-nums">{job.salary}</span>
              </>
            )}
          </p>
        </div>
        <ScoreBadge score={score} tier={tier} />
      </div>

      <div
        className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`Match score ${score} out of 100`}
      >
        <div className={`h-full rounded-full ${TIER_BAR[tier]}`} style={{ width: `${score}%` }} />
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted">
        {leadParagraph(job.description)}
      </p>

      <div className="mt-5 border-t border-line pt-4">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
          Why this matches
        </h4>
        <ul className="mt-2.5 space-y-1.5">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5 text-sm leading-6">
              <span
                aria-hidden="true"
                className="mt-[11px] size-1 shrink-0 rounded-full bg-line-strong"
              />
              <span className="min-w-0">{reason}</span>
            </li>
          ))}
        </ul>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {matched.map((skill) => (
            <li
              key={skill}
              className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-medium"
            >
              {skill}
            </li>
          ))}
          {gaps.map((skill) => (
            <li
              key={skill}
              className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-xs text-muted"
            >
              {skill}
              <span className="sr-only"> — not found in your resume</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {footnotes.length > 0 ? (
          <p className="text-xs text-muted">{footnotes.join(" · ")}</p>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-xs text-muted transition-colors group-hover:text-fg">
          View details →
        </span>
      </div>
    </article>
  );
}
