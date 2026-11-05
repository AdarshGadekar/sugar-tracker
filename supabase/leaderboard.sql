-- Leaderboard: aggregated, read-only stats for every confirmed user.
-- Exposes display name (user_metadata.name, else "Player") and counts only — never emails or individual days.
-- NOT yet applied to the live project. Apply when deploying the ux-animations branch.

create or replace function public.leaderboard()
returns table (name text, sugar_days int, clean_days int, streak int, locked boolean, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select id, coalesce(nullif(trim(raw_user_meta_data->>'name'), ''), 'Player') as name
    from auth.users
    where email_confirmed_at is not null
  ),
  agg as (
    select user_id,
           count(*) filter (where had_sugar)     as sugar_days,
           count(*) filter (where not had_sugar) as clean_days,
           max(day)                              as last_day
    from day_marks group by user_id
  ),
  -- runs of consecutive no-sugar days ("gaps and islands")
  islands as (
    select user_id, max(day) as end_day, count(*) as len
    from (
      select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp
      from day_marks where not had_sugar
    ) s
    group by user_id, grp
  ),
  -- current streak = the run that ends at the user's latest mark, if that mark is today or yesterday
  streaks as (
    select i.user_id, i.len
    from islands i join agg a on a.user_id = i.user_id
    where i.end_day = a.last_day
      and a.last_day >= ((now() at time zone 'UTC')::date - 1)
  )
  select u.name,
         coalesce(a.sugar_days, 0)::int,
         coalesce(a.clean_days, 0)::int,
         coalesce(s.len, 0)::int,
         coalesce(a.sugar_days, 0) > 3,
         u.id = auth.uid()
  from u
  left join agg a on a.user_id = u.id
  left join streaks s on s.user_id = u.id
  where auth.uid() is not null
  order by (coalesce(a.sugar_days, 0) > 3), coalesce(s.len, 0) desc,
           coalesce(a.clean_days, 0) desc, coalesce(a.sugar_days, 0), u.name;
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;
