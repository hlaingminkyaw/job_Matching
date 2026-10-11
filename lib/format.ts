/**
 * "3 days ago" from a stored timestamp, rather than a frozen string in the
 * database that is wrong by the following week.
 *
 * `now` is injectable so this stays a pure function to test.
 */
export function relativeDay(iso: string | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const days = Math.floor((now - then) / 86_400_000);

  if (days < 0) return "just posted";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
