import type { MatchTier } from "@/lib/matching";

// Written as explicit box-shadows rather than ring-* utilities: v3's
// `ring-inset` was renamed in Tailwind v4 and fails silently if it's wrong.
const TIER_PILL: Record<MatchTier, string> = {
  strong:
    "bg-strong-soft text-strong shadow-[inset_0_0_0_1px_rgb(52_211_153/0.32),0_0_20px_-6px_var(--brand-glow)]",
  solid: "bg-solid-soft text-solid shadow-[inset_0_0_0_1px_rgb(251_191_36/0.25)]",
  stretch: "bg-stretch-soft text-stretch shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]",
};

export const TIER_BAR: Record<MatchTier, string> = {
  strong:
    "bg-[linear-gradient(90deg,var(--strong),var(--brand-2))] shadow-[0_0_12px_-2px_var(--brand-glow)]",
  solid: "bg-solid",
  stretch: "bg-stretch",
};

export function ScoreBadge({ score, tier }: { score: number; tier: MatchTier }) {
  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium tabular-nums ${TIER_PILL[tier]}`}
    >
      {/* Only the best matches pulse — on a list of 20, pulsing every badge
          would be noise rather than emphasis. */}
      {tier === "strong" && (
        <span className="relative flex size-1.5 self-center" aria-hidden="true">
          <span className="badge-pulse absolute inline-flex size-full rounded-full bg-strong" />
          <span className="relative inline-flex size-1.5 rounded-full bg-strong" />
        </span>
      )}
      <span className="text-[15px] font-semibold">{score}%</span>
      Match
    </span>
  );
}
