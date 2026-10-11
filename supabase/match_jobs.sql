-- Run this in the Supabase SQL editor after the pgvector script you already ran.
--
-- Two changes:
--   1. Adds the display-only columns the job cards render.
--   2. Replaces match_jobs so it returns those columns plus `similarity`.
--
-- The function has to be dropped first: Postgres refuses to CREATE OR REPLACE a
-- function whose return type changed.

alter table jobs
  add column if not exists employment text,
  add column if not exists level      text,
  add column if not exists salary     text,
  add column if not exists posted     text,
  add column if not exists source_url text,
  add column if not exists email      text;

-- `posted` is no longer written or returned — created_at carries the posting
-- date now. Drop it when you're ready:
--
--   alter table jobs drop column if exists posted;

drop function if exists match_jobs(vector, float, int);

create or replace function match_jobs (
  query_embedding vector(768),
  match_threshold float,
  match_count     int
)
returns table (
  -- Matches jobs.id, which is uuid in this project. If you change the column
  -- type, change it here too — Postgres raises 42P13 the moment they disagree.
  id             uuid,
  title          text,
  company        text,
  location       text,
  description    text,
  must_haves     text[],
  nice_to_haves  text[],
  employment     text,
  level          text,
  salary         text,
  source_url     text,
  email          text,
  -- The posting date. The UI renders it as "3 days ago" at read time; storing
  -- a string like that would be wrong by the following week.
  created_at     timestamptz,
  similarity     float
)
language sql
stable
as $$
  select
    j.id,
    j.title,
    j.company,
    j.location,
    j.description,
    j.must_haves,
    j.nice_to_haves,
    j.employment,
    j.level,
    j.salary,
    j.source_url,
    j.email,
    j.created_at,
    1 - (j.embedding <=> query_embedding) as similarity
  from jobs j
  where j.embedding is not null
    and 1 - (j.embedding <=> query_embedding) > match_threshold
  order by j.embedding <=> query_embedding
  limit match_count;
$$;

-- `<=>` is cosine distance, so `1 - distance` is cosine similarity. Ordering by
-- the distance (not the similarity) is what lets the index do the work.
--
-- Worth adding once you have more than a few hundred rows:
--
--   create index on jobs using hnsw (embedding vector_cosine_ops);
