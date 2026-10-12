-- Usage logging for /api/match. Run this in the Supabase SQL editor.
--
-- Answers "how many people actually ran a match", which page-view analytics
-- cannot: a visitor who lands and leaves never reaches this table.
--
-- Deliberately stores no resume text. The resume is personal data and the app
-- has no account system to tie consent to, so only its length is kept.

create table if not exists searches (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- sha256(ip + service-role key), truncated. One stable id per visitor so
  -- repeat searches can be told apart from distinct people, but not
  -- reversible to an IP address.
  visitor      text,
  country      text,

  -- 'matched' | 'no_matches' | 'error'
  outcome      text not null,
  -- The route's own error code when outcome = 'error': rate_limited,
  -- database_unreachable, resume_too_long, and so on.
  error_code   text,

  match_count  int,
  top_score    int,
  -- Title rather than a jobs.id FK: the seed script deletes every row before
  -- reinserting, which would blank out an FK on each reseed.
  top_job      text,
  resume_chars int
);

create index if not exists searches_created_at_idx on searches (created_at desc);
create index if not exists searches_visitor_idx    on searches (visitor);
create index if not exists searches_outcome_idx    on searches (outcome);

-- RLS on with zero policies: the anon key can read nothing. Only the service
-- role key, which stays server-side, can write and read these rows.
alter table searches enable row level security;
