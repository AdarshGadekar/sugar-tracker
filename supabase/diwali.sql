-- Diwali gift: everyone gets all 3 hearts back, plus a one-time pop-up and a group chat post.
--
-- PART 1 (schema, safe to apply before the new app is deployed):
--   * day_marks.forgiven — a forgiven sugar day stays on the calendar but no longer costs a heart
--   * announcements + announcement_reads — one-time pop-ups, each person sees each one once
--   * mark_day / leaderboard count only sugar days that aren't forgiven
--
-- PART 2 (the gift itself) is at the bottom — run it once, after the new app is live.

-- ======================= PART 1: schema =======================

alter table public.day_marks add column if not exists forgiven boolean not null default false;

create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  title      text not null,
  body       text not null,
  icon       text not null default '🎁',
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;   -- read only through next_announcement()

create table if not exists public.announcement_reads (
  user_id         uuid   not null references auth.users(id) on delete cascade,
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  seen_at         timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;

-- The oldest announcement this person hasn't seen yet (only ones made after they joined).
create or replace function public.next_announcement()
returns table (id bigint, title text, body text, icon text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.title, a.body, a.icon
  from announcements a
  join auth.users u on u.id = auth.uid()
  where u.created_at <= a.created_at
    and not exists (select 1 from announcement_reads r where r.user_id = u.id and r.announcement_id = a.id)
  order by a.created_at
  limit 1;
$$;

-- Mark an announcement as seen so it never pops up again.
create or replace function public.ack_announcement(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into announcement_reads (user_id, announcement_id)
  select auth.uid(), a.id from announcements a
  where a.id = p_id and auth.uid() is not null
  on conflict do nothing;
$$;

revoke all on function public.next_announcement() from public, anon;
revoke all on function public.ack_announcement(bigint) from public, anon;
grant execute on function public.next_announcement() to authenticated;
grant execute on function public.ack_announcement(bigint) to authenticated;

-- ----- mark_day: forgiven sugar days don't count -----
create or replace function public.mark_day(p_day date, p_had_sugar boolean, p_tz text default 'UTC')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
  v_tz    text := 'UTC';
  v_today date;
  v_name  text;
  v_run   int;
  v_left  int;
  max_sugar constant int := 3;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_day is null or p_had_sugar is null then
    raise exception 'Day and choice are required' using errcode = '22004';
  end if;

  if p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz) then
    v_tz := p_tz;
  end if;
  v_today := (now() at time zone v_tz)::date;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select count(*) into v_count
  from day_marks where user_id = v_uid and had_sugar and not forgiven;

  if v_count > max_sugar then
    raise exception 'Your tracker is locked: you used all % chances.', max_sugar using errcode = 'P0001';
  end if;
  if p_day >= v_today then
    raise exception 'You can only mark a day once it''s over.' using errcode = 'P0001';
  end if;
  if exists (select 1 from day_marks where user_id = v_uid and day = p_day) then
    raise exception 'That day is already marked.' using errcode = 'P0001';
  end if;

  insert into day_marks (user_id, day, had_sugar) values (v_uid, p_day, p_had_sugar);
  if p_had_sugar then
    v_count := v_count + 1;
  end if;

  -- ----- milestone post (never blocks the mark itself) -----
  begin
    select coalesce(nullif(btrim(raw_user_meta_data->>'name'), ''), 'Player')
      into v_name from auth.users where id = v_uid;

    if p_had_sugar then
      v_left := greatest(0, max_sugar - v_count);
      insert into messages (user_id, name, body, kind) values (v_uid, v_name,
        case
          when v_count > max_sugar then '☠️ ' || v_name || ' is out of lives — game over. Thanks for playing honestly!'
          when v_left = 0 then '⚠️ ' || v_name || ' just used their last life. Cheer them on — no more sugar!'
          else '💔 ' || v_name || ' lost a life (' || v_left || ' left). Send some support!'
        end, 'system');
    elsif p_day = v_today - 1 then
      with recursive run(d) as (
        select p_day
        union all
        select run.d - 1 from run
        where exists (select 1 from day_marks m
                      where m.user_id = v_uid and m.day = run.d - 1 and not m.had_sugar)
      )
      select count(*) into v_run from run;
      if v_run in (3, 7, 14, 21, 30, 50, 100) then
        insert into messages (user_id, name, body, kind)
        values (v_uid, v_name, '🔥 ' || v_name || ' hit a ' || v_run || '-day no-sugar streak!', 'system');
      end if;
    end if;
  exception when others then
    null; -- a failed chat post must never undo the day mark
  end;

  return json_build_object('sugar_count', v_count, 'max_sugar', max_sugar, 'locked', v_count > max_sugar);
end;
$$;
revoke all on function public.mark_day(date, boolean, text) from public, anon;
grant execute on function public.mark_day(date, boolean, text) to authenticated;

-- ----- leaderboard: forgiven sugar days don't cost hearts -----
create or replace function public.leaderboard()
returns table (name text, sugar_days int, clean_days int, streak int, locked boolean, is_me boolean, user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select id, coalesce(nullif(trim(raw_user_meta_data->>'name'), ''), 'Player') as name
    from auth.users where email_confirmed_at is not null
  ),
  agg as (
    select user_id,
           count(*) filter (where had_sugar and not forgiven) as sugar_days,
           count(*) filter (where not had_sugar)              as clean_days,
           max(day)                                           as last_day
    from day_marks group by user_id
  ),
  islands as (
    select user_id, max(day) as end_day, count(*) as len
    from (
      select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp
      from day_marks where not had_sugar
    ) s
    group by user_id, grp
  ),
  streaks as (
    select i.user_id, i.len
    from islands i join agg a on a.user_id = i.user_id
    where i.end_day = a.last_day and a.last_day >= ((now() at time zone 'UTC')::date - 1)
  )
  select u.name,
         coalesce(a.sugar_days, 0)::int,
         coalesce(a.clean_days, 0)::int,
         coalesce(s.len, 0)::int,
         coalesce(a.sugar_days, 0) > 3,
         u.id = auth.uid(),
         u.id
  from u
  left join agg a on a.user_id = u.id
  left join streaks s on s.user_id = u.id
  where auth.uid() is not null
  order by (coalesce(a.sugar_days, 0) > 3), coalesce(s.len, 0) desc,
           coalesce(a.clean_days, 0) desc, coalesce(a.sugar_days, 0), u.name;
$$;
revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

-- ======================= PART 2: the gift (run once, after deploy) =======================
-- update public.day_marks set forgiven = true where had_sugar and not forgiven;
-- insert into public.announcements (title, body, icon) values
--   ('Happy Diwali! 🪔',
--    'All 3 hearts are back — it''s a Diwali gift! 🎁 Your sugar days so far are forgiven. Fresh start, make it count ✨',
--    '🪔');
-- insert into public.messages (user_id, name, body, kind) values
--   (null, 'Desserted',
--    '🪔 Happy Diwali! Everyone got all 3 hearts back — it''s a Diwali gift! 🎁 Fresh start, make it count ✨',
--    'system');
