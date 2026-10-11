/**
 * Seeds the postings from lib/jobs.ts into Supabase with their embeddings.
 *
 *   npm run seed
 *
 * Safe to re-run: it clears the table first, so you never end up with
 * duplicates after tweaking a description. Posting dates are generated
 * relative to now, so every run produces a listing from the past 30 days.
 *
 * Imports carry explicit .ts extensions because this runs on Node's native
 * type stripping (Node 22.6+), which does not resolve extensionless paths.
 */
import { JOBS, jobEmbeddingInput } from "../lib/jobs.ts";
import { EMBED_CHUNK_SIZE, EMBEDDING_MODEL, EmbeddingError, embedAll } from "../lib/embeddings.ts";
import { getSupabaseAdmin } from "../lib/supabase.ts";

/**
 * Set to false if your jobs table only has the columns from the original
 * pgvector script, without the ones supabase/match_jobs.sql adds.
 */
const HAS_DISPLAY_COLUMNS = true;

/** Rows per insert. Keeps the request body modest for 20+ postings. */
const INSERT_CHUNK_SIZE = 10;

async function main() {
  const supabase = getSupabaseAdmin();

  console.log(
    `Embedding ${JOBS.length} jobs with ${EMBEDDING_MODEL} ` +
      `(${Math.ceil(JOBS.length / EMBED_CHUNK_SIZE)} requests of up to ${EMBED_CHUNK_SIZE})…`,
  );

  const vectors = await embedAll(JOBS.map(jobEmbeddingInput), "RETRIEVAL_DOCUMENT", {
    onChunk: (done, total) => console.log(`  … ${done}/${total}`),
    onRetry: (attempt, waitMs, reason) =>
      console.log(`  ! ${reason}, retry ${attempt} in ${waitMs}ms`),
  });

  console.log(`  ✓ ${vectors.length} vectors, ${vectors[0].length} dimensions each`);

  console.log("Clearing the jobs table…");
  const { error: deleteError } = await supabase.from("jobs").delete().not("id", "is", null);
  if (deleteError) {
    throw new Error(`Could not clear the jobs table: ${deleteError.message}`);
  }

  const rows = JOBS.map((job, index) => ({
    // jobs.id is uuid and NOT NULL with no default, so it has to be supplied.
    // Drop this line if you give the column `default gen_random_uuid()`.
    id: crypto.randomUUID(),
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    must_haves: job.mustHave,
    nice_to_haves: job.niceToHave,
    // supabase-js sends this as a JSON array and Postgres casts it to vector.
    // If your project rejects it, pass JSON.stringify(vectors[index]) instead.
    embedding: vectors[index],
    ...(HAS_DISPLAY_COLUMNS
      ? {
          // The posting date. The UI renders it as "3 days ago" at read time
          // rather than storing a string that goes stale.
          created_at: job.postedAt ?? new Date().toISOString(),
          source_url: job.sourceUrl ?? null,
          email: job.email ?? null,
          employment: job.employment ?? null,
          level: job.level ?? null,
          salary: job.salary ?? null,
        }
      : {}),
  }));

  console.log(`Inserting ${rows.length} rows…`);
  let inserted = 0;

  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const batch = rows.slice(start, start + INSERT_CHUNK_SIZE);
    const { data, error } = await supabase.from("jobs").insert(batch).select("id, title");

    if (error) {
      throw new Error(`Insert failed: ${error.message}${error.hint ? ` (${error.hint})` : ""}`);
    }
    inserted += data?.length ?? 0;
    console.log(`  … ${inserted}/${rows.length}`);
  }

  console.log(`\nDone — ${inserted} postings seeded. Start the dev server and paste a resume.`);
}

main().catch((error: unknown) => {
  if (error instanceof EmbeddingError && error.kind === "rate_limit") {
    console.error("\nGemini kept rate-limiting after several retries. Wait a minute and re-run.");
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
