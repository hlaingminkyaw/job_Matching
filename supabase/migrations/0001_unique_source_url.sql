-- Lets the sync upsert on source_url instead of clearing the table.
--
-- Run this in the Supabase SQL editor before the first sync. Without it,
-- `upsert(..., { onConflict: "source_url" })` fails with 42P10: there is no
-- unique index for ON CONFLICT to resolve against.

-- 1. Existing rows must not collide, or the constraint can't be created.
--    The seeded fictional rows all carried distinct URLs, but a half-finished
--    sync could have left duplicates. Keep the newest row for each URL.
delete from jobs a
using jobs b
where a.source_url is not null
  and a.source_url = b.source_url
  and a.created_at < b.created_at;

-- 2. A partial unique index rather than a table constraint: Postgres treats
--    NULLs as distinct, so several rows may legitimately have no source_url,
--    and this keeps them out of the uniqueness check entirely.
create unique index if not exists jobs_source_url_key
  on jobs (source_url)
  where source_url is not null;

-- Supabase's PostgREST resolves `onConflict: "source_url"` against this index.
--
-- If you would rather have a named table constraint, and every row is
-- guaranteed to carry a source_url, use this instead:
--
--   alter table jobs add constraint unique_source_url unique (source_url);
