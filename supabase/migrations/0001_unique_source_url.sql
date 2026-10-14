-- Lets the sync upsert on source_url instead of clearing the table.
--
-- Run this in the Supabase SQL editor before the first sync. Without it,
-- `upsert(..., { onConflict: "source_url" })` fails with 42P10: there is no
-- unique index for ON CONFLICT to resolve against.
--
-- Safe to re-run, including on a database that ran the earlier version of this
-- file (which created a partial index the upsert could never use).

-- 1. Existing rows must not collide, or the constraint can't be created.
--    Keep the newest row for each URL; ctid breaks ties between rows that
--    share a created_at.
delete from jobs a
using jobs b
where a.source_url is not null
  and a.source_url = b.source_url
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.ctid < b.ctid));

-- 2. Drop the partial index an earlier version of this file created.
--    ON CONFLICT (source_url) cannot infer a partial index unless the statement
--    repeats its WHERE predicate, and PostgREST has no way to send one — so the
--    upsert kept failing with 42P10 even with that index in place.
--    Only the partial one: a constraint of the same name owns a plain index
--    that can't be dropped directly, and is exactly what step 3 wants.
--
-- 3. A plain unique constraint. Postgres treats NULLs as distinct, so rows
--    without a source_url are still allowed side by side.
do $$
begin
  if exists (
    select 1 from pg_index
    where indexrelid = to_regclass('jobs_source_url_key')
      and indpred is not null
  ) then
    drop index jobs_source_url_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_source_url_key' and conrelid = 'jobs'::regclass
  ) then
    alter table jobs add constraint jobs_source_url_key unique (source_url);
  end if;
end $$;
