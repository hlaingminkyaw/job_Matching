# Resume Match

Upload or paste a resume, get open tech roles in Myanmar ranked by how well they
fit, with the reasons and the gaps spelled out. Subscribe on Telegram and new
matching postings come to you after each daily sync.

Vector search over pgvector decides *which* roles come back and how close each
one is. Keyword overlap decides *what to say* about each one — "0.72 cosine
similarity" is not a reason anybody can act on.

```
                  ┌──────────── daily ────────────┐
Tech Career MM ──►│ fetch → parse → embed (DOC)   │──► upsert jobs on source_url
  (OneSite API)   └───────────────────────────────┘          │
                                                              └─► Telegram alerts
                                                                  for subscribers
resume file ──► /api/parse-resume (text layer, OCR fallback)
                       │
resume text ◄──────────┘
     │
     └─► count tokens ─► gemini-embedding-001 @ 768 dims (RETRIEVAL_QUERY)
                            │
                            └─► supabase.rpc('match_jobs', …) ──► rows + similarity
                                                                   │
                                            keyword overlap ───────┴──► JobMatch[]
```

> **The postings are real.** `lib/jobs.ts` and the `jobs` table hold live
> Tech Career MM postings. Company names, salaries and application addresses
> are copied word for word from the source. A wrong edit sends a real
> application to the wrong place, so re-fetch instead of editing entries by hand.

## Setup

```bash
npm install
cp .env.example .env.local      # then fill in the values below
```

| Variable | Needed for | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Everything | Supabase → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything | Same page. Server-only — bypasses RLS |
| `GEMINI_API_KEY` | Matching, sync, OCR | https://aistudio.google.com/apikey |
| `CRON_SECRET` | `/api/cron/sync-jobs` | `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | Alerts | @BotFather. Server-only — never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Alerts | The bot's @name without the `@` |
| `TELEGRAM_WEBHOOK_SECRET` | `/api/telegram/webhook` | `openssl rand -hex 32` |

The cron and webhook routes refuse to run without their secret. They do not
fall back to running without protection.

### Database

Run these in the Supabase SQL editor, in order:

| File | What it does |
|---|---|
| [`supabase/match_jobs.sql`](supabase/match_jobs.sql) | Adds the display columns (`employment`, `level`, `salary`, `posted`) and replaces `match_jobs` to return them with `similarity` |
| [`supabase/migrations/0001_unique_source_url.sql`](supabase/migrations/0001_unique_source_url.sql) | Removes duplicate URLs and adds a unique constraint on `jobs.source_url`. The sync upserts against it |
| [`supabase/migrations/0002_telegram_alerts.sql`](supabase/migrations/0002_telegram_alerts.sql) | `job_alerts` (subscriptions) and `job_alert_sends` (delivery log), both with RLS on and no policies |
| [`supabase/searches.sql`](supabase/searches.sql) | Optional. `searches` table for usage logging |

> The `RETURNS TABLE` block in `match_jobs.sql` declares `id uuid` to match this
> project's `jobs` table. If your column is a different type, change it there
> too — Postgres rejects the function with `42P13: return type mismatch` as soon
> as the two disagree.

If you'd rather not add the display columns, set `HAS_DISPLAY_COLUMNS = false`
at the top of [`scripts/seed-jobs.ts`](scripts/seed-jobs.ts); the cards just
leave out whatever is missing.

## Getting jobs into the database

There are three scripts. Use the sync for normal work.

| Command | What it does |
|---|---|
| `npm run sync` | **The live pipeline.** Fetches Tech Career MM, embeds, upserts on `source_url`, then sends Telegram alerts |
| `npm run seed` | Embeds the snapshot in `lib/jobs.ts`, **clears the table**, and inserts |
| `npm run fetch-jobs` | Rewrites the `JOBS` array in `lib/jobs.ts` from the live feed. Writes nothing to the database |

All three run on Node's native TypeScript stripping (Node 22.6+, no `tsx`),
which is why the scripts' imports carry explicit `.ts` extensions.

```bash
npm run sync                      # 40 postings, scanning up to 5 pages
npm run sync -- --limit 60        # more postings
npm run sync -- --pages 10        # look further back for them
npm run sync -- --dry-run         # parse and print, write nothing
npm run dev                       # → http://localhost:3000
```

### How the sync works

[`lib/sync-jobs.ts`](lib/sync-jobs.ts) is the one implementation behind the CLI,
the GitHub Action and the cron route.

1. **Fetch.** Tech Career MM is a client-rendered app, so the postings come from
   the OneSite blog API its bundle calls (`api.onesiteblog.com/api/blog/article-list`).
   It is public. Both `page` and `limit` are required, or it answers 500.
2. **Parse.** [`lib/techcareer.ts`](lib/techcareer.ts) turns each article into a
   `Job`:
   - The company comes from the fixed "<Company> နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်" opener.
   - The email is the first address that isn't the aggregator's own.
   - Location, level and employment type are read from the posting text.
   - Skills are matched against the same `ALIASES` vocabulary the matcher uses.
   - Postings are skipped when they aren't tech roles, have no company or
     recognisable skills, or are under 200 characters.
   - Reposts are removed by title + company.
   - Descriptions are cut to 4,500 characters at a line break.
3. **Embed** as `RETRIEVAL_DOCUMENT`, in paced chunks with backoff.
4. **Upsert** on `source_url`, 10 rows at a time. The article's own uuid becomes
   the row id, so a re-sync updates the same row. The table is never cleared,
   so a failed run leaves yesterday's listing in place.
5. **Dispatch alerts** (see below). A failure here is logged but doesn't fail
   the sync, because the rows are already written.

### Scheduling

- **Vercel Cron** (the daily run) — [`vercel.json`](vercel.json) calls
  `GET /api/cron/sync-jobs` at 00:00 UTC (06:30 Myanmar). Vercel sends
  `Authorization: Bearer $CRON_SECRET` on its own once `CRON_SECRET` is set in
  the project's environment variables. Crons only register on a production
  deploy; check Project → Settings → Cron Jobs. `maxDuration` is 60s; 40
  postings take about 15s.
- **GitHub Actions** (manual only) — [`.github/workflows/daily-job-sync.yml`](.github/workflows/daily-job-sync.yml)
  has no schedule, so it never doubles up with the Vercel run. Trigger it by
  hand with `limit`, `pages` and `dry_run` inputs. Add `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as repository secrets.
  **The workflow doesn't pass `TELEGRAM_BOT_TOKEN` yet**, so these runs skip
  alerts. Add it as a secret and to the step's `env:` block to turn them on.
- **HTTP** — `GET` or `POST /api/cron/sync-jobs?limit=40&pages=5` with
  `Authorization: Bearer $CRON_SECRET`.

The cron route returns 502 when the upstream feed fails and 429/500/502 for
embedding errors, so a monitor can tell "Tech Career is down" apart from
"this app is broken".

## Resume upload

Next to the textarea there is a drop zone that accepts **PDF, DOCX and TXT** up
to 4.5MB. 4.5MB is Vercel's request body limit, so a larger file would fail
before the route runs, with an unclear error. `.doc` (Word 97–2003) is rejected
with a "save as .docx" message.

`POST /api/parse-resume` (multipart, field `file`):

- **PDF:** the text layer is read with `pdf-parse` first. This is free and takes
  milliseconds. If fewer than 120 characters come back, the file is treated as
  a scan and sent to **Gemini OCR** (`gemini-3.5-flash`, thinking off, about 5s
  per page). Password-protected and non-PDF files stop before OCR.
- **DOCX:** read with `mammoth`. Its double spacing between paragraphs is
  reduced back to single line breaks.
- **TXT:** read as UTF-8, with Latin-1 as the fallback.

All output is normalised (control characters, soft hyphens, non-breaking spaces
and extra blank lines removed). OCR output also has its markdown stripped.
`**Laravel**` is not the token `Laravel`, and the extra symbols waste the token
budget.

The response includes `source` (`text-layer` | `ocr`), `truncated`, `tokens`
and `fits`, so the drop zone can warn before a search fails. `pdf-parse` is
listed in `serverExternalPackages` in [`next.config.ts`](next.config.ts).
Bundling it breaks the pdf.js worker and the native canvas binary.

## Telegram job alerts

After a search returns results, a card under them offers alerts. The flow:

1. The user opens the bot (`t.me/<NEXT_PUBLIC_TELEGRAM_BOT_USERNAME>`) and
   presses **Start**. The webhook replies with their chat ID in tap-to-copy
   `<code>`.
2. They paste the ID into the modal and choose a threshold (65 / 75 / 85%). The
   resume they already entered is sent with it, so they don't type it twice.
3. `POST /api/alerts/subscribe` checks the bot can reach the chat (`getChat`)
   **before** spending a Gemini call. It then counts tokens, embeds as
   `RETRIEVAL_QUERY`, and upserts on `telegram_chat_id`. Resubscribing replaces
   the old resume and turns alerts back on.
4. After each sync, [`lib/job-alerts.ts`](lib/job-alerts.ts) scores every new
   posting against every active subscriber and sends the ones above their
   threshold.

What the dispatcher guarantees:

- **The percentage matches the site.** It uses the same similarity window,
  seniority adjustment and keyword reasons as `/api/match`.
- **No repeats.** `job_alert_sends (alert_id, job_id)` is the dedup key. A send
  is recorded only after Telegram accepts it, so a failed send is retried on
  the next sync instead of being lost.
- **At most 5 alerts per subscriber per run**, best first, sent 80ms apart to
  stay under Telegram's flood limit.
- **Blocked bots deactivate themselves.** The row is kept, `is_active` is set
  to false.

`min_match_score` uses the **display score** scale (0–1, same as the badge),
not raw cosine similarity. Raw similarity on this corpus never goes above about
0.73, so a raw threshold of 0.75 would never send anything. The minimum allowed
is 0.5. The median pair already scores in the sixties.

Bot commands: `/start` or `/id` replies with the chat ID, `/stop` turns alerts
off. Register the webhook once per deployment (HTTPS only, so it doesn't work
on localhost):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<host>/api/telegram/webhook",
       "secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

For local work, message the bot and read your chat ID from
`https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates`.

> **Known gap:** `/api/alerts/subscribe` has no rate limiter. The reachability
> check blocks casual abuse, but put a limiter in front of it before linking it
> anywhere public.

## Usage logging

Each `/api/match` call writes one row to `searches`: outcome, error code, match
count, top score and job, resume length, country, and a hashed visitor id
(sha256 of the IP salted with the service role key, so it can't be reversed).
**No resume text is stored.** The insert runs in `after()`, so it adds no
latency, and a failed insert never fails the search.
[`supabase/usage-queries.sql`](supabase/usage-queries.sql) has ready-made
queries for daily counts, returning visitors and failure breakdowns.

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
- **View original post / Find similar roles** — from `jobSourceUrl()` in
  [`lib/jobs.ts`](lib/jobs.ts). A real Tech Career `/article-details/<slug>`
  link is used as-is. A dead or missing link falls back to a LinkedIn Myanmar
  search for the role, and the button changes to "Find similar roles", so the
  link always works. This is applied when the row is read, so old rows are
  fixed without reseeding.

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

## Layout

```
app/
  api/match/route.ts             POST { resume } → { matches: JobMatch[] }
  api/parse-resume/route.ts      POST multipart file → { text, source, fits, … }
  api/alerts/subscribe/route.ts  POST { chatId, resumeText, minScore? }
  api/telegram/webhook/route.ts  Bot /start, /id, /stop
  api/cron/sync-jobs/route.ts    Bearer-guarded sync trigger
  page.tsx                       Header, hero, footer
  globals.css                    Tailwind v4 import + design tokens
components/
  match-explorer.tsx             Client: resume state, fetch, loading/error, selection
  resume-panel.tsx               Drop zone, textarea, word count, submit
  resume-upload.tsx              PDF/DOCX/TXT drop zone
  job-match-card.tsx             Score badge, meter, snippet, reasons, skill chips
  job-detail-modal.tsx           Right-side drawer built on <dialog>
  job-description.tsx            Plain-text posting → paragraphs and bullet lists
  telegram-alert-modal.tsx       Alert signup card + modal
lib/
  supabase.ts                    Server-only admin client
  embeddings.ts                  Gemini embeddings, token counting, typed errors
  matching.ts                    Scoring, reasons, gaps
  jobs.ts                        Job type, link resolution, generated JOBS snapshot
  techcareer.ts                  Tech Career MM fetch + parse
  sync-jobs.ts                   Fetch → embed → upsert → alerts
  job-alerts.ts                  Alert scoring and dispatch
  telegram.ts                    Bot API transport + message formatting
  ocr.ts                         Gemini PDF OCR fallback
  resume-text.ts                 Upload rules, text normalisation (browser-safe)
  analytics.ts                   searches logging
scripts/
  sync-techcareer-jobs.ts  seed-jobs.ts  fetch-jobs.ts
supabase/
  match_jobs.sql  searches.sql  usage-queries.sql  migrations/
.github/workflows/daily-job-sync.yml
```

## API

`POST /api/match` with `{ "resume": "..." }` returns:

```json
{ "matches": [ { "job": {...}, "score": 86, "tier": "strong",
                 "matched": [...], "gaps": [...], "reasons": [...],
                 "similarity": 0.71 } ],
  "threshold": 0.3 }
```

Errors from every route come back as `{ "error": { "code", "message" } }`. The
`message` is written for the person looking at the screen and is rendered
as-is. For `/api/match`:

| Status | Code | When |
|---|---|---|
| 400 | `empty_resume`, `invalid_body` | Nothing pasted, or malformed JSON |
| 413 | `resume_too_long` | Over 2,048 tokens (or 20,000 characters). The message says roughly how many characters to cut |
| 429 | `rate_limited` | Gemini quota |
| 500 | `misconfigured`, `missing_function` | Bad/absent key, or `match_jobs` not found |
| 502 | `embedding_failed`, `database_error`, `upstream_error` | Upstream said no, or the token count failed |
| 503 | `database_unreachable` | Supabase unreachable or env var missing |

`/api/parse-resume` adds `no_file`, `empty_file`, `unsupported_type`,
`unreadable_file`, `no_text` (400) and `file_too_large` (413).
`/api/alerts/subscribe` adds `invalid_chat_id`, `invalid_min_score` (400),
`chat_unreachable` (422, the user hasn't pressed Start) and
`telegram_unavailable` (502).

## A note on the embedding model

`text-embedding-004` is retired — the API answers 404 for it. This uses
**`gemini-embedding-001`**, which emits 3072 dimensions natively and supports
Matryoshka truncation to 768, so the `vector(768)` column is unchanged.

Things that came out of testing it:

- Truncated vectors come back **un-normalized** (~0.59 magnitude at 768 dims).
  `lib/embeddings.ts` normalizes them. Cosine distance doesn't care, but unit
  vectors keep the numbers comparable and leave `<#>` available later.
- **`gemini-embedding-2` is not a drop-in.** Given a 2-item batch it returned a
  single embedding. `embedBatch` throws when the count doesn't match, so this
  fails loudly rather than silently mis-assigning vectors to jobs — but don't
  change `EMBEDDING_MODEL` without re-testing a batch.
- **The limit is 2,048 tokens, and it is checked with `countTokens`, not by
  counting characters.** The same 7,500 characters measured 1,092 tokens of
  plain English, 1,895 of bullet-point tech nouns, 3,187 of mostly URLs and
  5,704 of Burmese. The old 6,000-character cap rejected English resumes that
  fit and accepted Burmese ones that didn't. This matters because
  `embedContent` doesn't reject an input that is too long. It cuts it short
  without saying so, and the resume is matched on its first part only.
  `MAX_EMBED_CHARS` (20,000) only blocks very large inputs before the token
  count request.

## Tuning the score

The badge percentage comes from two things, both in
[`lib/matching.ts`](lib/matching.ts).

**1. Cosine similarity, mapped through a window:**

```ts
const SIMILARITY_FLOOR = 0.56;    // measured min across the seed set: 0.556
const SIMILARITY_CEILING = 0.74;  // measured max: 0.727
```

Measured over all 110 resume×job pairs in the earlier 22-posting fictional
seed set with gemini-embedding-001: **min 0.556, median 0.607, max 0.727**. Two
pieces of career prose never land near 0, so mapping 0–1 onto 0–100% puts every
result in the fifties.

**Re-measure against the live postings.** The window was set on the old
fictional data, and the corpus is now real Tech Career MM text with more
Burmese in it. Every response includes the raw `similarity` for this. Re-measure
whenever you change the model, `jobEmbeddingInput()`, or the kind of postings
you index. The Telegram thresholds use the same scale, so they move with it.

**Known limitation.** Similarity carries a per-domain offset. A design resume
scores about 0.03 lower against design postings than an engineering resume does
against engineering postings, so a designer's best match reads "solid" (72–75%)
where an equally good engineering match reads "strong" (86%). Ordering within
each search is still correct — it's the absolute label that's conservative. A
single linear window can't correct for this; it needs a per-domain baseline,
which is only worth building once the posting mix settles.

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
  key bypasses row-level security, so keep it out of client components.
  `lib/telegram.ts` holds the bot token and is server-only for the same reason.
- `job_alerts` stores resume text and chat IDs. RLS is on with no policies, so
  only the service role can read it. Keep it that way. The anon key is shipped
  to the browser.
- Jobs are embedded as `RETRIEVAL_DOCUMENT`, resumes as `RETRIEVAL_QUERY`
  everywhere, including subscriptions. Using one task type for both measurably
  hurts ranking.
- `matchJobs()` in `lib/matching.ts` still does keyword-only ranking against the
  hardcoded list. The UI no longer uses it; it's there for offline work and tests.

## Author

**Hlaing Min Kyaw** — [hmkportfolio.vercel.app](https://hmkportfolio.vercel.app/)
