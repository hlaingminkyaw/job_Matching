import type { MatchTier } from "@/lib/matching";

const TIER_PILL: Record<MatchTier, string> = {
  strong: "bg-strong-soft text-strong",
  solid: "bg-solid-soft text-solid",
  stretch: "bg-stretch-soft text-stretch",
};

export const TIER_BAR: Record<MatchTier, string> = {
  strong: "bg-strong",
  solid: "bg-solid",
  stretch: "bg-stretch",
};

export function ScoreBadge({ score, tier }: { score: number; tier: MatchTier }) {
  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium tabular-nums ${TIER_PILL[tier]}`}
    >
      <span className="text-[15px] font-semibold">{score}%</span>
      Match
    </span>
  );
}
