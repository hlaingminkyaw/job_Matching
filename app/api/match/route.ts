import { NextResponse } from "next/server";
import { normalizeSourceUrl, type Job, type JobLevel } from "@/lib/jobs";
import { logSearch } from "@/lib/analytics";
import { EmbeddingError, MAX_EMBED_CHARS, embedText } from "@/lib/embeddings";
import {
  explainMatch,
  keywordScore,
  levelAdjustment,
  scoreFromSimilarity,
  tierFor,
  type JobMatch,
} from "@/lib/matching";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATCH_THRESHOLD = 0.3;
// The threshold is what actually filters: Myanmar postings all sit above ~0.59
// similarity to any career resume, so in practice this count is the limit.
const MATCH_COUNT = 20;

/** Whatever the match_jobs function returns. Extras are optional by design. */
type MatchJobsRow = {
  id: string | number;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  must_haves: string[] | null;
  nice_to_haves: string[] | null;
  similarity: number | null;
  source_url?: string | null;
  email?: string | null;
  created_at?: string | null;
  employment?: string | null;
  level?: string | null;
  salary?: string | null;
};

const LEVELS: JobLevel[] = ["Junior", "Mid", "Senior", "Staff"];

function asLevel(value: string | null | undefined): JobLevel | undefined {
  return LEVELS.find((level) => level === value);
}

function toJob(row: MatchJobsRow): Job {
  return {
    id: String(row.id),
    title: row.title,
    company: row.company ?? "Unlisted company",
    location: row.location ?? "Location not listed",
    description: row.description ?? "",
    mustHave: row.must_haves ?? [],
    niceToHave: row.nice_to_haves ?? [],
    // Normalized here, not just at seed time, so the rows already in Supabase
    // stop pointing at 404s without anyone rerunning the seed.
    sourceUrl: normalizeSourceUrl(row.source_url),
    email: row.email ?? undefined,
    postedAt: row.created_at ?? undefined,
    employment: row.employment ?? undefined,
    level: asLevel(row.level),
    salary: row.salary ?? undefined,
  };
}

export async function POST(request: Request) {
  // Set as soon as the resume is read, so a failure logged below still records
  // how long the input was.
  let resumeChars: number | undefined;

  /** Every error response also lands in `searches` with its code. */
  const fail = (status: number, code: string, message: string) => {
    logSearch(request, { outcome: "error", errorCode: code, resumeChars });
    return NextResponse.json({ error: { code, message } }, { status });
  };

  let resume: unknown;
  try {
    const body: unknown = await request.json();
    resume = (body as { resume?: unknown })?.resume;
  } catch {
    return fail(400, "invalid_body", "Request body must be JSON shaped like { resume: string }.");
  }

  if (typeof resume !== "string" || !resume.trim()) {
    return fail(400, "empty_resume", "Paste a resume before searching.");
  }
  resumeChars = resume.length;
  if (resume.length > MAX_EMBED_CHARS) {
    return fail(
      413,
      "resume_too_long",
      `That resume is ${resume.length.toLocaleString()} characters. Trim it to ${MAX_EMBED_CHARS.toLocaleString()} or fewer — the embedding model takes 2,048 tokens.`,
    );
  }

  // 1. Embed the resume as a query.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(resume, "RETRIEVAL_QUERY");
  } catch (error) {
    if (error instanceof EmbeddingError) {
      console.error(`[match] embedding failed (${error.kind}):`, error.cause ?? error.message);
      if (error.kind === "rate_limit") {
        return fail(429, "rate_limited", "Gemini is rate-limiting right now. Try again in a few seconds.");
      }
      if (error.kind === "too_long") {
        return fail(413, "resume_too_long", "That resume is too long to embed. Trim it and retry.");
      }
      if (error.kind === "config") {
        return fail(500, "misconfigured", error.message);
      }
      return fail(502, "embedding_failed", "Could not analyze the resume. Try again.");
    }
    console.error("[match] unexpected embedding error:", error);
    return fail(500, "internal_error", "Something went wrong analyzing the resume.");
  }

  // 2. Nearest neighbours from pgvector.
  let rows: MatchJobsRow[];
  try {
    const { data, error } = await getSupabaseAdmin().rpc("match_jobs", {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });

    if (error) {
      console.error("[match] supabase rpc error:", error);
      if (error.code === "PGRST202") {
        return fail(
          500,
          "missing_function",
          "The match_jobs function isn't reachable. Check its name and argument types in Supabase.",
        );
      }
      return fail(502, "database_error", "The job database rejected the query. Try again.");
    }

    rows = (data ?? []) as MatchJobsRow[];
  } catch (error) {
    // Thrown rather than returned: bad URL, missing env var, network down.
    console.error("[match] supabase unreachable:", error);
    const message = error instanceof Error && /Missing [A-Z_]+/.test(error.message)
      ? error.message
      : "Could not reach the job database. Check your Supabase connection.";
    return fail(503, "database_unreachable", message);
  }

  // 3. Vector search ranks; keyword overlap explains.
  const matches: JobMatch[] = rows.map((row) => {
    const job = toJob(row);
    const similarity = typeof row.similarity === "number" ? row.similarity : null;
    // Similarity sets the base; seniority fit nudges it, since embeddings
    // barely register the difference between a junior and a senior posting.
    const score =
      (similarity === null
        ? null
        : scoreFromSimilarity(similarity, levelAdjustment(resume, job))) ??
      keywordScore(resume, job);

    return {
      job,
      score,
      tier: tierFor(score),
      similarity: similarity ?? undefined,
      ...explainMatch(resume, job),
    };
  });

  matches.sort((a, b) => b.score - a.score || a.job.title.localeCompare(b.job.title));

  const best = matches[0];
  logSearch(request, {
    // A 200 with nothing in it is the interesting case: the search worked and
    // still found this person nothing.
    outcome: matches.length ? "matched" : "no_matches",
    matchCount: matches.length,
    topScore: best?.score,
    topJob: best && `${best.job.title} — ${best.job.company}`,
    resumeChars,
  });

  return NextResponse.json({ matches, threshold: MATCH_THRESHOLD });
}
