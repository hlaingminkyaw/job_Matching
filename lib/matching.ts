import { JOBS, type Job, type JobLevel } from "./jobs";

export type MatchTier = "strong" | "solid" | "stretch";

export type JobMatch = {
  job: Job;
  score: number;
  tier: MatchTier;
  matched: string[];
  /** Must-have skills we could not find anywhere in the resume. */
  gaps: string[];
  reasons: string[];
  /** Raw cosine similarity from pgvector, when the match came from the API. */
  similarity?: number;
};

/**
 * Keyword matching. The vector search decides *which* jobs come back and how
 * close they are; this decides what to tell the user about each one, since
 * "0.72 cosine similarity" is not a reason anybody can act on.
 */
const ALIASES: Record<string, string[]> = {
  React: ["reactjs", "react.js"],
  TypeScript: ["ts"],
  JavaScript: ["js", "es6", "ecmascript"],
  "Next.js": ["nextjs", "next"],
  "Node.js": ["node", "nodejs", "express"],
  PostgreSQL: ["postgres", "psql", "sql"],
  "Tailwind CSS": ["tailwind", "tailwindcss"],
  GraphQL: ["apollo"],
  Accessibility: ["a11y", "wcag", "aria", "screen reader"],
  "Design systems": ["design system", "component library", "storybook"],
  "D3.js": ["d3"],
  SVG: ["vector graphics"],
  Canvas: ["webgl"],
  "Build tooling": ["webpack", "vite", "turbopack", "esbuild", "rollup", "bundler"],
  Monorepos: ["monorepo", "turborepo", "nx", "pnpm workspaces"],
  "CI/CD": ["ci cd", "github actions", "continuous integration", "circleci"],
  Testing: ["jest", "vitest", "playwright", "cypress", "unit tests", "e2e"],
  Performance: ["core web vitals", "lighthouse", "profiling", "time to interactive"],
  Experimentation: ["a b test", "ab testing", "experiment", "feature flag", "funnel"],
  Analytics: ["amplitude", "mixpanel", "posthog", "segment"],
  "REST APIs": ["rest", "api design", "endpoints"],
  AWS: ["amazon web services", "s3", "lambda", "ec2"],
  Docker: ["containers", "containerized"],
  Kubernetes: ["k8s"],
  Redis: ["memcached"],
  "Distributed systems": ["distributed system", "microservices", "event driven"],
  Python: ["django", "fastapi", "flask"],
  Go: ["golang"],
  Figma: ["design handoff"],
  PHP: ["php8", "php 8", "php 7"],
  Laravel: ["eloquent", "blade", "livewire", "artisan", "lumen"],
  MySQL: ["mariadb"],
  "Vue.js": ["vue", "vuejs", "nuxt", "pinia", "vuex"],
  "HTML/CSS": ["html", "css", "html5", "css3", "scss", "sass", "responsive"],
  Git: ["github", "gitlab", "bitbucket", "version control"],
  Bootstrap: ["bootstrap 5", "bootstrap5"],
  jQuery: ["jquery"],
  Flutter: ["dart"],
  WordPress: ["woocommerce", "elementor", "wordpress theme", "wp"],
  Linux: ["ubuntu", "debian", "centos", "bash", "shell scripting"],
  Nginx: ["apache", "reverse proxy", "load balancer"],
  Firebase: ["firestore", "fcm", "firebase auth"],
  "React Native": ["react-native", "expo"],
  "Manual testing": ["test case", "test plan", "manual qa", "regression testing", "postman"],
  "Test automation": ["selenium", "appium", "automated test", "e2e test", "test suite"],
  "UI/UX": ["ui ux", "user experience", "user interface design", "user research", "usability"],
  Prototyping: ["prototype", "wireframe", "mockup"],
  ETL: ["etl pipeline", "airflow", "data pipeline", "dbt", "data warehouse"],
  Pandas: ["numpy", "dataframe", "jupyter"],
};

/** Lowercase, strip punctuation, pad with spaces so we can match whole tokens. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim()} `;
}

function mentions(haystack: string, skill: string): boolean {
  const terms = [skill, ...(ALIASES[skill] ?? [])];
  return terms.some((term) => haystack.includes(normalize(term)));
}

export function tierFor(score: number): MatchTier {
  if (score >= 80) return "strong";
  if (score >= 62) return "solid";
  return "stretch";
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * Seniority
 *
 * Skill coverage alone ranks a junior posting first for anyone who has
 * outgrown it — a three-year developer covers every basic a junior role
 * lists, so it scores 100% on coverage. Experience level is a separate
 * axis, and being over-qualified has to cost something.
 * ------------------------------------------------------------------ */

type ResumeLevel = "Junior" | "Mid" | "Senior";

const JOB_RANK: Record<JobLevel, number> = { Junior: 0, Mid: 1, Senior: 2, Staff: 2 };
const RESUME_RANK: Record<ResumeLevel, number> = { Junior: 0, Mid: 1, Senior: 2 };

export function resumeLevel(resume: string): ResumeLevel {
  if (/\b(senior|staff|principal|lead|architect)\b/i.test(resume)) return "Senior";

  const years = [...resume.matchAll(/(\d{1,2})\s*\+?\s*years?/gi)].map((match) => Number(match[1]));
  const most = years.length ? Math.max(...years) : 0;

  if (most >= 6) return "Senior";
  if (most >= 2) return "Mid";
  return "Junior";
}

/** Positive means the role sits above the resume; negative, below it. */
function levelGap(resume: string, job: Job): number | null {
  return job.level ? JOB_RANK[job.level] - RESUME_RANK[resumeLevel(resume)] : null;
}

/**
 * Points added to the score for seniority fit. A step up is free — people
 * should be shown roles they can grow into — but a step down is penalised,
 * because being over-qualified is the thing coverage gets wrong.
 */
export function levelAdjustment(resume: string, job: Job): number {
  const gap = levelGap(resume, job);
  if (gap === null) return 0;
  if (gap === 0) return 4;
  if (gap === 1) return 0;
  if (gap === -1) return -8;
  return -14;
}

function levelReason(gap: number, job: Job): string | null {
  const level = job.level?.toLowerCase();
  if (gap === 0) return `Scoped at the ${level} level your experience reads at.`;
  if (gap === 1) return `A step up from your current level — a reachable stretch.`;
  if (gap > 1) return `Scoped well above your experience, at the ${level} level.`;
  return `You'd be over-qualified — this one is pitched at ${level} candidates.`;
}

type Analysis = {
  mustHit: string[];
  niceHit: string[];
  gaps: string[];
  levelGap: number | null;
};

function analyze(resume: string, job: Job): Analysis {
  const text = normalize(resume);
  const mustHit = job.mustHave.filter((skill) => mentions(text, skill));

  return {
    mustHit,
    niceHit: job.niceToHave.filter((skill) => mentions(text, skill)),
    gaps: job.mustHave.filter((skill) => !mustHit.includes(skill)),
    levelGap: levelGap(resume, job),
  };
}

/** Matched skills, gaps, and the plain-English reasons shown on each card. */
export function explainMatch(
  resume: string,
  job: Job,
): Pick<JobMatch, "matched" | "gaps" | "reasons"> {
  const { mustHit, niceHit, gaps, levelGap: gap } = analyze(resume, job);
  const reasons: string[] = [];

  if (mustHit.length) {
    reasons.push(
      `Covers ${mustHit.length} of ${job.mustHave.length} must-have skills — ${list(mustHit)}.`,
    );
  } else if (job.mustHave.length) {
    reasons.push(`No overlap yet with the core stack (${list(job.mustHave)}).`);
  } else {
    reasons.push("Surfaced by overall similarity — this posting lists no explicit skills.");
  }

  // An over-qualification warning outranks a nice-to-have list.
  const seniority = gap === null ? null : levelReason(gap, job);
  if (seniority && gap !== null && gap < 0) reasons.push(seniority);

  if (niceHit.length) {
    reasons.push(`Extra credit for ${list(niceHit)}.`);
  }
  if (seniority && gap !== null && gap >= 0) {
    reasons.push(seniority);
  }
  if (gaps.length) {
    reasons.push(`Worth addressing: ${list(gaps)} isn't mentioned anywhere.`);
  }

  return { matched: [...mustHit, ...niceHit], gaps, reasons: reasons.slice(0, 3) };
}

const MUST_WEIGHT = 0.75;
const NICE_WEIGHT = 0.25;

function clampScore(score: number): number {
  return Math.max(12, Math.min(97, Math.round(score)));
}

/** Skill-overlap score, 12–97. Used offline and as a fallback in the API route. */
export function keywordScore(resume: string, job: Job): number {
  const { mustHit, niceHit } = analyze(resume, job);

  const coverage =
    MUST_WEIGHT * (job.mustHave.length ? mustHit.length / job.mustHave.length : 0) +
    NICE_WEIGHT * (job.niceToHave.length ? niceHit.length / job.niceToHave.length : 0);

  const base = 31 + coverage * 64 + levelAdjustment(resume, job);
  return clampScore(mustHit.length === 0 ? Math.min(base, 45) : base);
}

/**
 * Cosine similarity → the percentage on the badge.
 *
 * Measured over all 110 resume×job pairs in the 22-posting seed set with
 * gemini-embedding-001: min 0.556, median 0.607, max 0.727. Two pieces of
 * career prose never land anywhere near 0, so mapping 0–1 onto 0–100% would
 * put every result in the fifties.
 *
 * Known limitation: similarity carries a per-domain offset. Design resumes
 * score ~0.03 lower against design postings than engineering resumes do
 * against engineering postings, so a designer's best match reads "solid"
 * where an equally good engineering match reads "strong". A single linear
 * window cannot correct for that — it needs a per-domain baseline, which is
 * only worth building once the posting mix is settled.
 *
 * Re-measure whenever you change the model, jobEmbeddingInput(), or the kind
 * of postings you index.
 */
const SIMILARITY_FLOOR = 0.56;
const SIMILARITY_CEILING = 0.74;

export function scoreFromSimilarity(similarity: number, adjustment = 0): number | null {
  if (!Number.isFinite(similarity)) return null;
  const t = (similarity - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR);
  return clampScore(20 + t * 77 + adjustment);
}

/**
 * Local keyword-only ranking over the hardcoded job list. The UI now goes
 * through /api/match instead; this stays for offline work and tests.
 */
export function matchJobs(resume: string, jobs: Job[] = JOBS): JobMatch[] {
  return jobs
    .map<JobMatch>((job) => {
      const score = keywordScore(resume, job);
      return { job, score, tier: tierFor(score), ...explainMatch(resume, job) };
    })
    .sort((a, b) => b.score - a.score || a.job.title.localeCompare(b.job.title));
}
