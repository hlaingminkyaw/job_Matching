/**
 * Rewrites the JOBS array in lib/jobs.ts from live Tech Career MM postings.
 *
 *   npm run fetch-jobs -- --limit 40 --pages 5
 *
 * This is the offline path: it bakes a snapshot into the repo so the app has
 * data without a database. For the live pipeline — embed and upsert straight
 * into Supabase — use `npm run sync` instead.
 *
 * Fetching and parsing live in lib/techcareer.ts, shared with the sync.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { TechCareerError, fetchJobs } from "../lib/techcareer.ts";
import type { Job } from "../lib/jobs.ts";

const JOBS_FILE = new URL("../lib/jobs.ts", import.meta.url).pathname;

function numberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const limit = numberArg("limit", 40);
const pages = numberArg("pages", 5);

function literal(value: string): string {
  return JSON.stringify(value);
}

function emit(job: Job): string {
  const lines = [
    "  {",
    `    id: ${literal(job.id)},`,
    `    title: ${literal(job.title)},`,
    `    company: ${literal(job.company)},`,
    `    location: ${literal(job.location)},`,
    `    description: ${literal(job.description)},`,
    `    mustHave: ${JSON.stringify(job.mustHave)},`,
    `    niceToHave: ${JSON.stringify(job.niceToHave)},`,
    `    sourceUrl: ${literal(job.sourceUrl!)},`,
  ];
  if (job.email) lines.push(`    email: ${literal(job.email)},`);
  if (job.postedAt) lines.push(`    postedAt: ${literal(job.postedAt)},`);
  if (job.employment) lines.push(`    employment: ${literal(job.employment)},`);
  if (job.level) lines.push(`    level: ${literal(job.level)},`);
  if (job.salary) lines.push(`    salary: ${literal(job.salary)},`);
  lines.push("  },");
  return lines.join("\n");
}

async function main() {
  const jobs = await fetchJobs({ limit, pages });

  const header = `/**
 * Real Tech Career MM postings. GENERATED — do not edit by hand.
 *
 *   npm run fetch-jobs -- --limit ${limit} --pages ${pages}
 *
 * Companies, salaries and application addresses are taken verbatim from the
 * live postings, so they are real: a wrong edit here sends a real application
 * to the wrong place. Re-run the script rather than patching entries.
 *
 * Fetched ${new Date().toISOString().slice(0, 10)}.
 */
export const JOBS: Job[] = [`;

  const source = readFileSync(JOBS_FILE, "utf8");
  const start = source.indexOf("export const JOBS: Job[] = [");
  if (start === -1) throw new Error("Could not find the JOBS array in lib/jobs.ts");

  // The array is the last thing in the file, so everything above it is the
  // types and helpers, which this script leaves untouched.
  const preamble = source
    .slice(0, start)
    .replace(/\/\*\*(?:(?!\*\/)[\s\S])*?GENERATED[\s\S]*?\*\/\s*$/, "");

  writeFileSync(JOBS_FILE, `${preamble}${header}\n${jobs.map(emit).join("\n")}\n];\n`);

  console.log(`Wrote ${jobs.length} jobs to lib/jobs.ts`);
  console.log(`  ${jobs.filter((job) => job.email).length}/${jobs.length} have an address`);
  console.log(`  ${new Set(jobs.map((job) => job.company)).size} distinct companies`);
  console.log("\nNext: npm run seed");
}

main().catch((error: unknown) => {
  const prefix = error instanceof TechCareerError ? "Tech Career MM: " : "";
  console.error(`\n${prefix}${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
