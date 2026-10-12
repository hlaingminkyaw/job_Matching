/**
 * Fetch live Tech Career MM postings, embed them, and upsert them into
 * Supabase. One implementation behind both entry points:
 *
 *   scripts/sync-techcareer-jobs.ts   — CLI / GitHub Actions
 *   app/api/cron/sync-jobs/route.ts   — scheduled HTTP trigger
 *
 * Upserts rather than clearing the table, so a failed run leaves yesterday's
 * listing intact instead of an empty site.
 */

import { EMBED_CHUNK_SIZE, EMBEDDING_MODEL, embedAll } from "./embeddings.ts";
import { dispatchJobAlerts, type AlertDispatchResult } from "./job-alerts.ts";
import { jobEmbeddingInput, type Job } from "./jobs.ts";
import { getSupabaseAdmin } from "./supabase.ts";
import { fetchJobs } from "./techcareer.ts";

/** Rows per upsert. Keeps each request body modest — vectors are 768 floats. */
const UPSERT_CHUNK_SIZE = 10;

export type SyncOptions = {
  /** Postings to sync. */
  limit?: number;
  /** API pages to walk looking for them (100 articles per page). */
  pages?: number;
  /** Progress reporting. The CLI logs; the route stays quiet. */
  onProgress?: (message: string) => void;
};

export type SyncResult = {
  ok: true;
  /** Usable postings parsed out of the feed. */
  fetched: number;
  /** Rows written. Equal to `fetched` unless a chunk was rejected. */
  upserted: number;
  companies: number;
  withEmail: number;
  durationMs: number;
  model: string;
  /** Telegram fan-out. Absent when it was skipped or failed. */
  alerts?: AlertDispatchResult;
};

export const SYNC_DEFAULTS = { limit: 40, pages: 5 } as const;

export async function syncJobs(options: SyncOptions = {}): Promise<SyncResult> {
  const limit = options.limit ?? SYNC_DEFAULTS.limit;
  const pages = options.pages ?? SYNC_DEFAULTS.pages;
  const log = options.onProgress ?? (() => {});
  const startedAt = Date.now();

  // 1. Live postings.
  log(`Fetching up to ${limit} postings from Tech Career MM…`);
  const jobs = await fetchJobs({ limit, pages });
  log(`  ✓ ${jobs.length} usable postings`);

  // 2. Embeddings. embedAll batches by EMBED_CHUNK_SIZE with pacing and
  //    backoff, which is what keeps a daily run inside the rate limit.
  log(
    `Embedding with ${EMBEDDING_MODEL} ` +
      `(${Math.ceil(jobs.length / EMBED_CHUNK_SIZE)} requests of up to ${EMBED_CHUNK_SIZE})…`,
  );
  const vectors = await embedAll(jobs.map(jobEmbeddingInput), "RETRIEVAL_DOCUMENT", {
    onChunk: (done, total) => log(`  … ${done}/${total}`),
    onRetry: (attempt, waitMs, reason) => log(`  ! ${reason}, retry ${attempt} in ${waitMs}ms`),
  });
  log(`  ✓ ${vectors.length} vectors, ${vectors[0].length} dimensions each`);

  // 3. Upsert on source_url.
  const rows = jobs.map((job, index) => toRow(job, vectors[index]));
  const supabase = getSupabaseAdmin();
  let upserted = 0;

  log(`Upserting ${rows.length} rows on source_url…`);
  for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
    const batch = rows.slice(start, start + UPSERT_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("jobs")
      .upsert(batch, { onConflict: "source_url", ignoreDuplicates: false })
      .select("id");

    if (error) {
      // 42P10: no unique constraint matching the ON CONFLICT target.
      if (error.code === "42P10" || /no unique|exclusion constraint/i.test(error.message)) {
        throw new Error(
          "jobs.source_url has no UNIQUE constraint, so upserting can't resolve conflicts. " +
            "Run supabase/migrations/0001_unique_source_url.sql first.",
        );
      }
      throw new Error(`Upsert failed: ${error.message}${error.hint ? ` (${error.hint})` : ""}`);
    }

    upserted += data?.length ?? 0;
    log(`  … ${upserted}/${rows.length}`);
  }

  // 4. Telegram alerts, after the rows exist — job_alert_sends references
  //    jobs.id, so dispatching before the upsert would fail on the foreign key.
  //
  //    Isolated from the sync's own outcome on purpose: the rows are already
  //    written by this point, and the site works whether or not a notification
  //    went out. Failing the whole run over a Telegram outage would also mean
  //    GitHub Actions reports a red build for a sync that did its job.
  let alerts: AlertDispatchResult | undefined;
  try {
    log("Dispatching Telegram alerts…");
    alerts = await dispatchJobAlerts(jobs, vectors, log);
    if (alerts.subscribers) {
      log(
        `  ✓ ${alerts.sent} sent to ${alerts.subscribers} subscribers` +
          `${alerts.failed ? `, ${alerts.failed} failed` : ""}` +
          `${alerts.deactivated ? `, ${alerts.deactivated} deactivated` : ""}`,
      );
    }
  } catch (error) {
    console.error("[sync] alert dispatch failed:", error);
    log(`  ! alerts failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    ok: true,
    fetched: jobs.length,
    upserted,
    companies: new Set(jobs.map((job) => job.company)).size,
    withEmail: jobs.filter((job) => job.email).length,
    durationMs: Date.now() - startedAt,
    model: EMBEDDING_MODEL,
    alerts,
  };
}

/**
 * The article's own uuid becomes the row id. It's stable across runs, so a
 * re-sync updates the same row rather than rewriting its primary key — which
 * an ON CONFLICT update would otherwise do on every pass.
 */
function toRow(job: Job, embedding: number[]) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    must_haves: job.mustHave,
    nice_to_haves: job.niceToHave,
    embedding,
    source_url: job.sourceUrl,
    email: job.email ?? null,
    created_at: job.postedAt ?? new Date().toISOString(),
    employment: job.employment ?? null,
    level: job.level ?? null,
    salary: job.salary ?? null,
  };
}
