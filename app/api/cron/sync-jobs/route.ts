import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { EmbeddingError } from "@/lib/embeddings";
import { SYNC_DEFAULTS, syncJobs } from "@/lib/sync-jobs";
import { TechCareerError } from "@/lib/techcareer";

/**
 * Scheduled Tech Career MM sync.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sync-jobs
 *
 * GET is what Vercel Cron sends; POST is here for GitHub Actions and manual
 * triggers. Both run the same job.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Embedding 40 postings takes ~15s. 60s is the Hobby ceiling. */
export const maxDuration = 60;

/** Keeps a wrong-length guess from leaking its length through an exception. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;

  // Refuse rather than run unprotected: without this the route would be an
  // open endpoint that spends Gemini quota on request.
  if (!expected) {
    console.error("[cron/sync-jobs] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json(
      { error: { code: "misconfigured", message: "CRON_SECRET is not configured." } },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Missing or invalid bearer token." } },
      { status: 401 },
    );
  }

  return null;
}

async function handle(request: Request): Promise<NextResponse> {
  const denied = authorize(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limit = positiveInt(params.get("limit"), SYNC_DEFAULTS.limit);
  const pages = positiveInt(params.get("pages"), SYNC_DEFAULTS.pages);

  try {
    const result = await syncJobs({ limit, pages });
    console.log(
      `[cron/sync-jobs] ${result.upserted} rows from ${result.fetched} postings ` +
        `in ${(result.durationMs / 1000).toFixed(1)}s`,
    );
    return NextResponse.json(result);
  } catch (error) {
    // The upstream feed being down is not this app being broken, so these get
    // 502/503 rather than 500 — a monitor can tell them apart.
    if (error instanceof TechCareerError) {
      console.error("[cron/sync-jobs] upstream feed:", error.message);
      return fail(502, "upstream_unavailable", error.message);
    }
    if (error instanceof EmbeddingError) {
      console.error(`[cron/sync-jobs] embedding (${error.kind}):`, error.message);
      const status = error.kind === "rate_limit" ? 429 : error.kind === "config" ? 500 : 502;
      return fail(status, `embedding_${error.kind}`, error.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/sync-jobs] failed:", message);
    return fail(500, "sync_failed", message);
  }
}

function positiveInt(raw: string | null, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const GET = handle;
export const POST = handle;
