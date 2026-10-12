/**
 * Live job postings from Tech Career MM (techcareerweb.com).
 *
 * The site is a client-rendered Next.js app, so its HTML is just a loading
 * shell — the postings come from the OneSite blog API its bundle calls:
 *
 *   GET https://api.onesiteblog.com/api/blog/article-list
 *       ?domain=https://techcareerweb.com&page=<n>&limit=<n>
 *
 * Public and unauthenticated; the same data the site renders for a visitor.
 * Both `page` and `limit` are required — omit either and it answers 500.
 *
 * Shared by scripts/sync-techcareer-jobs.ts and the cron route, so the CLI and
 * the scheduled run parse postings identically.
 */

import { ALIASES } from "./matching.ts";
import type { Job, JobLevel } from "./jobs.ts";

const API = "https://api.onesiteblog.com/api/blog/article-list";
export const TECH_CAREER_DOMAIN = "https://techcareerweb.com";

/** The spec's stand-in when a posting doesn't state pay. */
export const DEFAULT_SALARY = "Negotiable / Market Rate";

/**
 * Leaves room for the title, company and skill lines jobEmbeddingInput() wraps
 * around the description, so a long posting can't push a request past the
 * model's input limit mid-sync.
 *
 * An absolute number rather than MAX_EMBED_CHARS minus a margin: that constant
 * is now a loose pre-filter (see lib/embeddings.ts) and following it upwards
 * would quietly start embedding more of each posting than the rows already in
 * the table were built from, leaving old and new jobs on different footings.
 */
const MAX_DESCRIPTION_CHARS = 4_500;

export type Article = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  content: string;
  createdAt: string;
};

export class TechCareerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TechCareerError";
  }
}

// ── Fetching ──────────────────────────────────────────────────────────────

export async function fetchArticlePage(page: number, limit = 100): Promise<Article[]> {
  const url = `${API}?domain=${encodeURIComponent(TECH_CAREER_DOMAIN)}&page=${page}&limit=${limit}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new TechCareerError(`Could not reach the Tech Career MM API.`, { cause: error });
  }

  if (!response.ok) {
    throw new TechCareerError(`Tech Career MM API answered HTTP ${response.status}.`);
  }

  const json = (await response.json()) as {
    meta?: { success?: boolean; message?: string };
    body?: { data?: Article[]; total?: number };
  };

  if (!json.meta?.success) {
    throw new TechCareerError(`Tech Career MM API said: ${json.meta?.message ?? "unknown error"}`);
  }

  return json.body?.data ?? [];
}

// ── Parsing ───────────────────────────────────────────────────────────────

/** Posting bodies are stored as HTML fragments. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Every posting opens with "<Company> နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်"
 * ("to work together with <Company>"). It is the only place the employer is
 * named in a fixed position, so it's the one reliable handle on the field.
 */
export function extractCompany(text: string): string | null {
  const match = text.match(/^(.{2,60}?)\s*နှင့်အတူ\s*လက်တွဲ\s*လုပ်ကိုင်ရန်/m);
  const company = match?.[1]?.replace(/^https?:\/\/\S+\s*/, "").trim();
  return company && company.length >= 2 ? company : null;
}

/** First address that isn't the aggregator's own. */
export function extractEmail(text: string): string | undefined {
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  return emails.find((email) => !/techcareer|techmart|onesite/i.test(email));
}

function extractField(text: string, label: RegExp): string | undefined {
  const value = text.match(label)?.[1]?.trim().replace(/[.,;]$/, "");
  return value && value.length <= 120 ? value : undefined;
}

const TOWNSHIPS = [
  "Hlaing", "Kamayut", "Bahan", "Sanchaung", "Thingangyun", "Mayangone",
  "Yankin", "Tamwe", "Dagon", "Botahtaung", "Kyauktada", "Pazundaung",
  "Insein", "Mingaladon", "Thaketa", "South Okkalapa", "North Okkalapa",
];

export function extractLocation(text: string): string {
  const township = TOWNSHIPS.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  const city = /\bMandalay\b/i.test(text) ? "Mandalay" : "Yangon";
  if (/\bremote\b/i.test(text) && !township) return "Remote · Myanmar";
  return township ? `${township}, ${city}` : `${city}, Myanmar`;
}

export function extractLevel(title: string, text: string): JobLevel {
  const haystack = `${title}\n${text.slice(0, 600)}`;
  if (/\b(senior|sr\.?|lead|principal|head of)\b/i.test(haystack)) return "Senior";
  if (/\b(junior|jr\.?|entry.level|fresh graduate|trainee|intern)\b/i.test(haystack)) {
    return "Junior";
  }
  return "Mid";
}

export function extractEmployment(text: string): string | undefined {
  if (/\bwork type\s*[:：]\s*remote/i.test(text) || /\bremote job\b/i.test(text)) return "Remote";
  if (/\bpart[- ]time\b/i.test(text)) return "Part-time";
  if (/\bcontract\b/i.test(text)) return "Contract";
  if (/\bfull[- ]time\b/i.test(text)) return "Full-time";
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Terms that are ordinary English before they are technologies.
 *
 * ALIASES is tuned for scanning a resume, where "next" or "go" in a list of
 * technologies almost always means the framework. Job postings are prose —
 * "the next phase", "go live", "network performance" — so matching these bare
 * tagged a Senior Network Engineer posting with Next.js. Each stays matchable
 * through its distinctive aliases: golang, nextjs, core web vitals, cypress.
 */
const TOO_GENERIC = new Set([
  "next", "go", "canvas", "wp", "rest", "ts", "js", "node", "experiment",
  "performance", "testing", "analytics", "accessibility", "prototype",
]);

/**
 * Skills the posting actually names, drawn from the same vocabulary the
 * matcher scores against — so a skill shown on a card is one explainMatch()
 * can also credit. Earlier mentions are the more prominent ones, so the first
 * few become must-haves and the rest nice-to-haves.
 */
export function extractSkills(text: string): { mustHave: string[]; niceToHave: string[] } {
  const haystack = text.toLowerCase();
  const found: { skill: string; at: number }[] = [];

  for (const [skill, aliases] of Object.entries(ALIASES)) {
    let earliest = Infinity;
    for (const term of [skill, ...aliases]) {
      if (TOO_GENERIC.has(term.toLowerCase())) continue;
      // \b misses "C++" and "Node.js", so bound on non-word characters.
      const pattern = new RegExp(
        `(^|[^a-z0-9+#.])${escapeRegex(term.toLowerCase())}([^a-z0-9+#]|$)`,
      );
      const index = haystack.search(pattern);
      if (index !== -1) earliest = Math.min(earliest, index);
    }
    if (earliest !== Infinity) found.push({ skill, at: earliest });
  }

  found.sort((a, b) => a.at - b.at);
  const names = found.map((entry) => entry.skill);
  return { mustHave: names.slice(0, 4), niceToHave: names.slice(4, 10) };
}

/** "Senior QA Engineer (M/F) 2 posts" → "Senior QA Engineer". */
export function cleanTitle(title: string): string {
  return title
    .replace(/\((?:m\/f|f\/m|male|female)\)/gi, "")
    .replace(/\b\d+\s*posts?\b/gi, "")
    .replace(/[\s\-–—,]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Roles this matcher can say something useful about. */
const TECH_TITLE =
  /\b(developer|engineer|programmer|software|web|frontend|front-end|backend|back-end|full[- ]?stack|mobile|android|ios|flutter|react|vue|angular|node|php|laravel|python|java|\.net|devops|sysadmin|system admin|database|dba|data|qa|quality assurance|tester|testing|ui\/?ux|designer|network|security|cloud|it officer|it support|technical)\b/i;

/** Titles that pass the tech filter but aren't hands-on tech work. */
const EXCLUDE_TITLE =
  /\b(sales|marketing|accountant|finance|driver|cleaner|security guard|receptionist)\b/i;

/**
 * One article → one Job, or null when it isn't a usable tech posting.
 *
 * Everything returned is taken verbatim from the posting. Nothing is inferred
 * beyond the salary placeholder, because a guessed company or address sends a
 * real application to the wrong place.
 */
export function articleToJob(article: Article): Job | null {
  const text = htmlToText(article.content ?? "");
  const title = cleanTitle(article.title ?? "");
  if (!title || !TECH_TITLE.test(title) || EXCLUDE_TITLE.test(title)) return null;

  // No slug means no stable link, and a card without a working link is the
  // problem this pipeline exists to avoid.
  const slug = article.slug ?? article.id;
  if (!slug) return null;

  const company = extractCompany(text);
  if (!company) return null;

  const { mustHave, niceToHave } = extractSkills(text);
  // Nothing recognisable to match on: the embedding would be the only signal
  // and the card would show an empty requirements list.
  if (mustHave.length === 0) return null;

  // Drop the aggregator's own footer so it isn't embedded into every posting.
  let description = text
    .replace(/IT\s*အလုပ်ခေါ်စာများကို[\s\S]*$/u, "")
    .replace(/^https?:\/\/\S+\s*/gm, "")
    .trim();
  if (description.length < 200) return null;

  if (description.length > MAX_DESCRIPTION_CHARS) {
    // Cut at a line break so a posting never ends mid-sentence.
    const cut = description.lastIndexOf("\n", MAX_DESCRIPTION_CHARS);
    description = `${description.slice(0, cut > 0 ? cut : MAX_DESCRIPTION_CHARS).trim()}\n…`;
  }

  return {
    id: article.id,
    title,
    company,
    location: extractLocation(text),
    description,
    mustHave,
    niceToHave,
    sourceUrl: `${TECH_CAREER_DOMAIN}/article-details/${slug}`,
    email: extractEmail(text),
    postedAt: article.createdAt,
    employment: extractEmployment(text),
    level: extractLevel(title, text),
    salary: extractField(text, /\bsalary\s*[:：]\s*(.+)/i) ?? DEFAULT_SALARY,
  };
}

/**
 * Walk pages until `limit` usable postings are collected.
 *
 * Deduplicated on title + company: the same vacancy is reposted week to week
 * under a fresh article id, and without this the listing fills with repeats.
 */
export async function fetchJobs(options: { limit: number; pages: number }): Promise<Job[]> {
  const { limit, pages } = options;
  const seen = new Set<string>();
  const jobs: Job[] = [];
  let scanned = 0;

  for (let page = 1; page <= pages && jobs.length < limit; page++) {
    const articles = await fetchArticlePage(page);
    if (articles.length === 0) break;
    scanned += articles.length;

    for (const article of articles) {
      if (jobs.length >= limit) break;

      const job = articleToJob(article);
      if (!job) continue;

      const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
    }
  }

  if (jobs.length === 0) {
    throw new TechCareerError(
      `Scanned ${scanned} articles and found no usable postings. The API shape may have changed.`,
    );
  }

  return jobs;
}
