import { createHash } from "node:crypto";
import { after } from "next/server";
import { getSupabaseAdmin } from "./supabase";

/**
 * Records each /api/match call in the `searches` table (supabase/searches.sql).
 *
 * Server-only, like lib/supabase.ts — it writes with the service role key.
 */

export type SearchOutcome = "matched" | "no_matches" | "error";

export type SearchLog = {
  outcome: SearchOutcome;
  /** The route's error code, when outcome is "error". */
  errorCode?: string;
  matchCount?: number;
  topScore?: number;
  topJob?: string;
  resumeChars?: number;
};

/**
 * A stable per-visitor id that can't be turned back into an IP address.
 *
 * The service role key doubles as the salt: it's already a server-only secret,
 * and a dedicated one would be another env var to keep in sync across
 * .env.local and Vercel. Rotating that key resets the hashes, which only means
 * returning visitors look new from that point on.
 */
function visitorHash(request: Request): string | null {
  // Vercel sets x-forwarded-for; the client IP is the first entry.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  if (!ip) return null;

  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 16);
}

/**
 * Fire-and-forget. `after()` runs the insert once the response has been sent,
 * so logging never adds latency to a match — and unlike a bare floating
 * promise, it still completes on Vercel, where the function would otherwise be
 * frozen the moment the response returns.
 *
 * A logging failure is swallowed: usage stats are never worth failing a search
 * the user already got results for.
 */
export function logSearch(request: Request, entry: SearchLog): void {
  after(async () => {
    try {
      const { error } = await getSupabaseAdmin().from("searches").insert({
        visitor: visitorHash(request),
        country: request.headers.get("x-vercel-ip-country"),
        outcome: entry.outcome,
        error_code: entry.errorCode ?? null,
        match_count: entry.matchCount ?? null,
        top_score: entry.topScore ?? null,
        top_job: entry.topJob ?? null,
        resume_chars: entry.resumeChars ?? null,
      });

      // Most likely cause: searches.sql hasn't been run on this project yet.
      if (error) console.error("[analytics] insert failed:", error.message);
    } catch (error) {
      console.error("[analytics] insert threw:", error);
    }
  });
}
