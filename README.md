# Resume Match

Paste a resume, get open roles ranked by how well they fit, with the reasons and
the gaps spelled out.

Vector search over pgvector decides *which* roles come back and how close each
one is. Keyword overlap decides *what to say* about each one — "0.72 cosine
similarity" is not a reason anybody can act on.

```
resume ──► gemini-embedding-001 @ 768 dims (RETRIEVAL_QUERY)
            │
            └─► supabase.rpc('match_jobs', …) ──► rows + similarity
                                                   │
                            keyword overlap ───────┴──► JobMatch[]
```

> **The seed data is fictional.** Every company, domain, email address and
> `techcareerweb.com` path in `lib/jobs.ts` is invented — written to read like
> a real Tech Career MM or LinkedIn Myanmar posting, but not taken from one.
> The Apply button puts a ready-to-send application one click away, so replace
> each `email` with the address on the actual posting before anyone uses this
> for real. A wrong address means an application goes nowhere, or reaches a
> company that never advertised the job. The LinkedIn `sourceUrl` values are
> real job-search links; the techcareerweb.com ones are placeholder paths.

## Setup

```bash
npm install
cp .env.example .env.local      # then fill in the three values
```

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. Server-only — bypasses RLS |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

Then run [`supabase/match_jobs.sql`](supabase/match_jobs.sql) in the Supabase SQL
editor. It adds the four display columns the cards render (`employment`, `level`,
`salary`, `posted`) and replaces `match_jobs` with a version that returns them
alongside `similarity`.

> The `RETURNS TABLE` block declares `id uuid` to match this project's `jobs`
> table. If your column is a different type, change it there too — Postgres
> rejects the function with `42P13: return type mismatch` as soon as the two
> disagree.

`jobs.id` is `uuid` and `NOT NULL` with no default, so the seed script generates
one per row with `crypto.randomUUID()`. If you'd rather the database do it:

```sql
alter table jobs alter column id set default gen_random_uuid();
```

then drop the `id:` line from the seed script.

If you'd rather not touch the schema, set `HAS_DISPLAY_COLUMNS = false` at the top
of [`scripts/seed-jobs.ts`](scripts/seed-jobs.ts); the cards just leave out
whatever is missing.

## Job detail drawer

Clicking a result opens a right-side drawer (full-screen on phones) with the
whole posting, the match breakdown, and the recruitment address with a **Copy
email** button.

Two actions at the bottom:

- **Apply via Gmail** — opens Gmail's compose window (`mail.google.com/mail/?view=cm…`)
  with `to`, a subject and a body template filled in. Gmail's compose URL cannot
  carry an attachment, so the draft and the UI both say to attach a CV first.
  Params are escaped with `encodeURIComponent`, not `URLSearchParams`, which
  form-encodes spaces as `+` — ambiguous inside a mail body.
- **View on LinkedIn / Tech Career MM** — `source_url`, labelled from its
  hostname.

Copy falls back to selecting the address when `navigator.clipboard` is blocked
(insecure origin, some in-app browsers).

It's a native `<dialog>` opened with `showModal()`, so Esc, focus trapping and
making the page behind it inert come from the platform. Backdrop clicks and the
close button are wired on top. The card's hit area is a stretched pseudo-element
on a real `<button>` around the title — the whole card is clickable, and there is
still exactly one thing for the keyboard to focus.

Postings are stored as plain text: blank lines separate blocks, and lines
starting with `-`, `*` or `•` become a bullet list. The card shows the first
paragraph clamped to three lines; the drawer renders the rest.

## Seed the jobs — run once

```bash
npm run seed
```

That's `node --env-file=.env.local scripts/seed-jobs.ts`, running on Node's
native TypeScript stripping (Node 22.6+, no `tsx` needed — which is why the
script's imports carry explicit `.ts` extensions).

It embeds the 22 postings in chunks of `EMBED_CHUNK_SIZE` (5 per request, with
400ms between them), clears the `jobs` table, then inserts in batches of 10.
Measured at about 6 seconds end to end.

`embedAll()` in [`lib/embeddings.ts`](lib/embeddings.ts) retries rate limits and
transient upstream failures up to 4 times with exponential backoff plus jitter;
anything else — a bad key, an oversized input, a dimension mismatch — throws
immediately rather than burning retries on an error that won't clear. Progress
and retries both print as they happen.

Safe to re-run after editing a description.

**Posting dates are generated relative to the run.** `lib/jobs.ts` stores
`daysAgo(n)`, the seed writes a real `created_at` timestamp, and
[`lib/format.ts`](lib/format.ts) renders "3 days ago" at read time. So every
seed produces a listing from the past 30 days instead of a frozen snapshot, and
nothing says "2 days ago" three weeks later.

```bash
npm run dev     # → http://localhost:3000
```

## Layout

```
app/
  api/match/route.ts      POST { resume } → { matches: JobMatch[] }
  page.tsx                Header, hero, footer
  globals.css             Tailwind v4 import + design tokens
components/
  match-explorer.tsx      Client: resume state, fetch, loading/error, selection
  resume-panel.tsx        Textarea, word count, submit button
  job-match-card.tsx      Score badge, meter, snippet, reasons, skill chips
  job-detail-modal.tsx    Right-side drawer built on <dialog>
  job-description.tsx     Plain-text posting → paragraphs and bullet lists
lib/
  supabase.ts             Server-only admin client
  embeddings.ts           Gemini embeddings + typed errors
  matching.ts             Scoring, reasons, gaps
  jobs.ts                 The six seed postings
scripts/seed-jobs.ts
supabase/match_jobs.sql
```

## API

`POST /api/match` with `{ "resume": "..." }` returns:

```json
{ "matches": [ { "job": {...}, "score": 86, "tier": "strong",
                 "matched": [...], "gaps": [...], "reasons": [...],
                 "similarity": 0.71 } ],
  "threshold": 0.3 }
```

Errors come back as `{ "error": { "code", "message" } }`. The `message` is
written for the person looking at the screen and is rendered as-is:

| Status | Code | When |
|---|---|---|
| 400 | `empty_resume`, `invalid_body` | Nothing pasted, or malformed JSON |
| 413 | `resume_too_long` | Over 6,000 characters (see below) |
| 429 | `rate_limited` | Gemini quota |
| 500 | `misconfigured`, `missing_function` | Bad/absent key, or `match_jobs` not found |
| 502 | `embedding_failed`, `database_error` | Upstream said no |
| 503 | `database_unreachable` | Supabase unreachable or env var missing |

## A note on the embedding model

`text-embedding-004` is retired — the API answers 404 for it. This uses
**`gemini-embedding-001`**, which emits 3072 dimensions natively and supports
Matryoshka truncation to 768, so the `vector(768)` column is unchanged.

Two things that came out of testing it:

- Truncated vectors come back **un-normalized** (~0.59 magnitude at 768 dims).
  `lib/embeddings.ts` normalizes them. Cosine distance doesn't care, but unit
  vectors keep the numbers comparable and leave `<#>` available later.
- **`gemini-embedding-2` is not a drop-in.** Given a 2-item batch it returned a
  single embedding. `embedBatch` throws when the count doesn't match, so this
  fails loudly rather than silently mis-assigning vectors to jobs — but don't
  change `EMBEDDING_MODEL` without re-testing a batch.

The input limit is 2,048 tokens, which is why resumes are capped at 6,000
characters (`MAX_EMBED_CHARS`). Roughly a two-page resume. If you need more,
chunk the resume and embed the chunks separately.

## Tuning the score

The badge percentage comes from two things, both in
[`lib/matching.ts`](lib/matching.ts).

**1. Cosine similarity, mapped through a window:**

```ts
const SIMILARITY_FLOOR = 0.56;    // measured min across the seed set: 0.556
const SIMILARITY_CEILING = 0.74;  // measured max: 0.727
```

Measured over all 110 resume×job pairs in the 22-posting seed set with
gemini-embedding-001: **min 0.556, median 0.607, max 0.727**. Two pieces of
career prose never land near 0, so mapping 0–1 onto 0–100% puts every result in
the fifties.

**Known limitation.** Similarity carries a per-domain offset. A design resume
scores about 0.03 lower against design postings than an engineering resume does
against engineering postings, so a designer's best match reads "solid" (72–75%)
where an equally good engineering match reads "strong" (86%). Ordering within
each search is still correct — it's the absolute label that's conservative. A
single linear window can't correct for this; it needs a per-domain baseline,
which is only worth building once the posting mix settles.

**Re-measure whenever you change the model, `jobEmbeddingInput()`, or the kind
of postings you index** — every response includes the raw `similarity` for
exactly this.

**2. A seniority adjustment**, because embeddings barely distinguish a junior
posting from a senior one:

| Role vs. resume | Points |
|---|---|
| Same level | +4 |
| One step up (a reachable stretch) | 0 |
| One step down (over-qualified) | −8 |
| Two or more steps apart | −14 |

Without it, skill coverage ranks a junior posting *first* for anyone who has
outgrown it — a three-year developer covers every basic such a role lists, so
it scores 100% on coverage. `resumeLevel()` reads the resume as Junior / Mid /
Senior from explicit titles or the largest "N years" it can find.

Tier cutoffs (`strong` at 80, `solid` at 62) sit next to the window.
`MATCH_THRESHOLD` and `MATCH_COUNT` are at the top of the route.

## Look and feel

Dark-committed, Linear/Supabase-flavoured: glass surfaces over a fixed ambience
layer (a masked grid and two blurred glow orbs), emerald→teal brand, amber for
the middle match tier.

**There is no light theme, on purpose.** Glass only reads as glass against a
dark ground, so a light mode would be a second design rather than a recolour.
`:root` in [`app/globals.css`](app/globals.css) sets `color-scheme: dark` and
every colour explicitly, with no `prefers-color-scheme` block. Components still
style through semantic tokens (`bg-panel`, `border-line`, `text-muted`), so
reintroducing a light theme later means redefining tokens, not touching
components.

Two performance choices worth keeping:

- **Cards don't use `backdrop-blur`.** Up to 20 render at once, and 20 blur
  layers is a visible scroll cost on a mid-range phone — which is most of the
  audience for these postings. The resume panel and drawer do blur; there's one
  of each. A flat translucent fill is indistinguishable over this background.
- **Orb blur drops from 110px to 70px under 640px**, and the orbs shrink. A
  110px blur over a 34rem box is one of the most expensive things a phone GPU
  can be asked for.

The strong-tier badge pulses; solid and stretch don't. Pulsing all 20 would be
noise rather than emphasis. The reduced-motion block sets
`animation-iteration-count: 1` alongside the duration override — without it an
infinite animation strobes instead of stopping.

## Notes

- `lib/supabase.ts` throws if it is ever called in the browser. The service role
  key bypasses row-level security, so keep it out of client components. The read
  path would work with the anon key plus a select policy; the seed script is what
  genuinely needs the service role.
- Jobs are embedded as `RETRIEVAL_DOCUMENT`, resumes as `RETRIEVAL_QUERY`. Using
  one task type for both measurably hurts ranking.
- `matchJobs()` in `lib/matching.ts` still does keyword-only ranking against the
  hardcoded list. The UI no longer uses it; it's there for offline work and tests.

## Author

**Hlaing Min Kyaw** — [hmkportfolio.vercel.app](https://hmkportfolio.vercel.app/)
