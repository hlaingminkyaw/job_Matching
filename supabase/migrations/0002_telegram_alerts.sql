-- Telegram job alerts: subscriptions, and a record of what has been sent.
--
-- Run this in the Supabase SQL editor after 0001_unique_source_url.sql.
-- Requires the `vector` extension, which the initial pgvector setup already
-- enabled for jobs.embedding.

-- ------------------------------------------------------------------ --
-- 1. Subscriptions
-- ------------------------------------------------------------------ --

create table if not exists job_alerts (
  id               uuid primary key default gen_random_uuid(),
  telegram_chat_id text not null,
  -- The resume text itself, not a summary of it. The dispatcher re-runs the
  -- keyword pass over it to write the "why it fits" lines in each alert, so it
  -- has to be the same text that produced the embedding.
  resume_summary   text not null,
  -- Must stay vector(768) to match jobs.embedding and EMBEDDING_DIMENSIONS.
  -- A mismatch is not caught until the first comparison, which then errors.
  resume_embedding vector(768) not null,
  -- On the 0-1 *display score* scale — the percentage the match badge shows —
  -- NOT raw cosine similarity. This matters: measured over this corpus, raw
  -- similarity between any resume and any posting runs 0.556 to 0.727, so a
  -- raw-similarity threshold of 0.75 could never be met and no alert would
  -- ever fire. lib/matching.ts#scoreFromSimilarity maps similarity onto the
  -- 20-97 badge scale, and the dispatcher compares that score / 100 here.
  -- 0.75 therefore means "alert me at 75% and up", which is what a subscriber
  -- setting this number would expect it to mean.
  min_match_score  numeric not null default 0.75 check (min_match_score between 0 and 1),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),

  -- Resubscribing updates the existing row rather than adding a second one.
  -- PostgREST resolves `onConflict: "telegram_chat_id"` against this.
  constraint job_alerts_telegram_chat_id_key unique (telegram_chat_id)
);

-- The UNIQUE constraint above already creates a btree index on
-- telegram_chat_id, and that index serves every lookup this table does. A
-- second index on the same column would be redundant — pure write cost for no
-- read benefit — so there is deliberately no `create index ... (telegram_chat_id)`
-- here.

-- The dispatcher's one hot query: every active subscriber, on each sync.
create index if not exists job_alerts_active_idx
  on job_alerts (created_at)
  where is_active;

-- ------------------------------------------------------------------ --
-- 2. Delivery log
-- ------------------------------------------------------------------ --

-- Without this, every sync re-alerts on every job a subscriber still matches:
-- the sync upserts the same postings each run, so "matches this resume" is
-- true again tomorrow and the day after. The primary key is the dedup.
create table if not exists job_alert_sends (
  alert_id uuid not null references job_alerts (id) on delete cascade,
  job_id   uuid not null references jobs (id) on delete cascade,
  -- The display score at send time, for working out after the fact whether a
  -- subscriber's threshold is set somewhere useful.
  score    numeric not null,
  sent_at  timestamptz not null default now(),
  primary key (alert_id, job_id)
);

-- ------------------------------------------------------------------ --
-- 3. Row-level security
-- ------------------------------------------------------------------ --

-- These tables hold resume text and Telegram chat IDs — personal data, and
-- enough of it to identify someone. Supabase exposes every table through
-- PostgREST, and NEXT_PUBLIC_SUPABASE_ANON_KEY ships to the browser by design,
-- so without RLS anyone who opens devtools can read every subscriber's resume.
--
-- Enabled with no policies at all: that denies the anon and authenticated
-- roles everything. The service role bypasses RLS, and lib/supabase.ts is the
-- only thing holding that key, so the subscribe route and the sync keep
-- working untouched.
alter table job_alerts       enable row level security;
alter table job_alert_sends  enable row level security;
