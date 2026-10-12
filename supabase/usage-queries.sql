-- Reading the usage numbers. Paste any one of these into the Supabase SQL
-- editor. Requires supabase/searches.sql to have been run first.

-- ── The headline: how many people, how many searches ──────────────────────
select
  count(*)                                          as searches,
  count(distinct visitor)                           as people,
  count(*) filter (where outcome = 'matched')       as found_jobs,
  count(*) filter (where outcome = 'no_matches')    as found_nothing,
  count(*) filter (where outcome = 'error')         as failed,
  min(created_at)                                   as first_search,
  max(created_at)                                   as latest_search
from searches;


-- ── Today, and the last 7 days ────────────────────────────────────────────
select
  count(*) filter (where created_at >= current_date)            as searches_today,
  count(distinct visitor) filter (where created_at >= current_date) as people_today,
  count(*) filter (where created_at >= current_date - 7)        as searches_7d,
  count(distinct visitor) filter (where created_at >= current_date - 7) as people_7d
from searches;


-- ── Day by day, last 30 days ──────────────────────────────────────────────
select
  created_at::date                             as day,
  count(*)                                     as searches,
  count(distinct visitor)                      as people,
  round(avg(match_count) filter (where outcome = 'matched'), 1) as avg_matches,
  round(avg(top_score)   filter (where outcome = 'matched'), 1) as avg_top_score
from searches
where created_at >= current_date - 30
group by day
order by day desc;


-- ── Casual visitors vs people who came back ───────────────────────────────
select
  searches_per_person,
  count(*) as people
from (
  select visitor, count(*) as searches_per_person
  from searches
  where visitor is not null
  group by visitor
) t
group by searches_per_person
order by searches_per_person;


-- ── Which postings keep coming out on top ─────────────────────────────────
select top_job, count(*) as times_ranked_first
from searches
where top_job is not null
group by top_job
order by times_ranked_first desc
limit 15;


-- ── What's breaking, if anything ──────────────────────────────────────────
-- Watch for rate_limited: that's Gemini throttling real users.
select error_code, count(*) as hits, max(created_at) as last_seen
from searches
where outcome = 'error'
group by error_code
order by hits desc;


-- ── Where people are searching from ───────────────────────────────────────
-- Populated on Vercel only; local requests have no country header.
select coalesce(country, 'unknown') as country, count(*) as searches
from searches
group by country
order by searches desc;
