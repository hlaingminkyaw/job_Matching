/**
 * Pulls live postings from Tech Career MM into Supabase.
 *
 *   npm run sync                      # 40 postings, 5 pages
 *   npm run sync -- --limit 60        # more postings
 *   npm run sync -- --pages 10        # look further back for them
 *   npm run sync -- --dry-run         # parse and report, write nothing
 *
 * Unlike `npm run seed`, this never clears the table: rows are upserted on
 * source_url, so a failed run leaves yesterday's listing in place rather than
 * an empty site. Run supabase/migrations/0001_unique_source_url.sql first.
 *
 * Imports carry explicit .ts extensions because this runs on Node's native
 * type stripping (Node 22.6+), which does not resolve extensionless paths.
 */

import { EmbeddingError } from "../lib/embeddings.ts";
import { SYNC_DEFAULTS, syncJobs } from "../lib/sync-jobs.ts";
import { TechCareerError, fetchJobs } from "../lib/techcareer.ts";

function numberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const limit = numberArg("limit", SYNC_DEFAULTS.limit);
const pages = numberArg("pages", SYNC_DEFAULTS.pages);
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (dryRun) {
    console.log(`Dry run — fetching up to ${limit} postings, writing nothing.\n`);
    const jobs = await fetchJobs({ limit, pages });

    for (const job of jobs) {
      console.log(`  ${(job.level ?? "—").padEnd(6)} ${job.title.slice(0, 40).padEnd(42)}`);
      console.log(`         ${job.company}  ·  ${job.location}`);
      console.log(`         ${job.salary}  ·  ${job.email ?? "no address"}`);
      console.log(`         ${job.mustHave.join(", ") || "—"}`);
      console.log(`         ${job.sourceUrl}\n`);
    }

    console.log(
      `${jobs.length} postings · ${new Set(jobs.map((j) => j.company)).size} companies · ` +
        `${jobs.filter((j) => j.email).length} with an address`,
    );
    return;
  }

  const result = await syncJobs({ limit, pages, onProgress: (message) => console.log(message) });

  console.log(
    `\nDone in ${(result.durationMs / 1000).toFixed(1)}s — ` +
      `${result.upserted} rows upserted from ${result.fetched} postings.`,
  );
  console.log(`  ${result.companies} distinct companies`);
  console.log(`  ${result.withEmail}/${result.fetched} have an application address`);
}

main().catch((error: unknown) => {
  // Each of these is actionable on its own terms, so say which one it was
  // rather than printing a stack trace into a CI log.
  if (error instanceof TechCareerError) {
    console.error(`\nTech Career MM: ${error.message}`);
  } else if (error instanceof EmbeddingError) {
    console.error(`\nGemini (${error.kind}): ${error.message}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
