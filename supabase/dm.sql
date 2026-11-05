-- Direct messages (1-to-1). Only the two people in a conversation can read it.
-- NOT yet applied to the live project.

-- ---------- Table ----------
create table if not exists public.direct_messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists dm_pair_idx on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists dm_inbox_idx on public.direct_messages (recipient_id, read_at);

alter table public.direct_messages enable row level security;

drop policy if exists "read own dms" on public.direct_messages;
create policy "read own dms" on public.direct_messages
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "send dms as self" on public.direct_messages;
create policy "send dms as self" on public.direct_messages
  for insert to authenticated with check (sender_id = auth.uid());

drop policy if exists "delete own sent dms" on public.direct_messages;
create policy "delete own sent dms" on public.direct_messages
  for delete to authenticated using (sender_id = auth.uid());

revoke all on public.direct_messages from anon;
revoke update on public.direct_messages from authenticated;   -- read receipts go through mark_dm_read()
grant select, insert, delete on public.direct_messages to authenticated;

-- ---------- Server-filled fields, validation, anti-spam ----------
create or replace function public.dm_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sender_id  := auth.uid();
  new.created_at := now();
  new.read_at    := null;
  new.body       := btrim(new.body);
  if new.sender_id is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if new.recipient_id = new.sender_id then
    raise exception 'You can''t message yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = new.recipient_id and email_confirmed_at is not null) then
    raise exception 'That person isn''t available.' using errcode = 'P0001';
  end if;
  if exists (select 1 from direct_messages
             where sender_id = new.sender_id and created_at > now() - interval '1 second') then
    raise exception 'Slow down a little — one message per second.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.dm_before_insert() from public, anon, authenticated;

drop trigger if exists dm_before_insert on public.direct_messages;
create trigger dm_before_insert before insert on public.direct_messages
  for each row execute function public.dm_before_insert();

-- Live updates (Realtime respects the RLS policy above: each person only receives their own DMs).
do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null; end $$;

-- ---------- Conversation list: everyone you can message + last message + unread count ----------
create or replace function public.dm_threads()
returns table (user_id uuid, name text, last_body text, last_at timestamptz, last_from_me boolean, unread int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id),
  people as (
    select u.id, coalesce(nullif(btrim(u.raw_user_meta_data->>'name'), ''), 'Player') as name
    from auth.users u, me
    where u.email_confirmed_at is not null and u.id <> me.id
  ),
  mine as (
    select case when d.sender_id = me.id then d.recipient_id else d.sender_id end as other,
           d.body, d.created_at, d.sender_id = me.id as from_me
    from direct_messages d, me
    where me.id in (d.sender_id, d.recipient_id)
  ),
  last as (
    select distinct on (other) other, body, created_at, from_me
    from mine order by other, created_at desc
  ),
  unread as (
    select d.sender_id as other, count(*)::int as n
    from direct_messages d, me
    where d.recipient_id = me.id and d.read_at is null
    group by d.sender_id
  )
  select p.id, p.name, l.body, l.created_at, coalesce(l.from_me, false), coalesce(u.n, 0)
  from people p
  left join last l on l.other = p.id
  left join unread u on u.other = p.id
  where (select id from me) is not null
  order by l.created_at desc nulls last, p.name;
$$;

-- ---------- One conversation (latest 100, oldest first). Runs as the caller, so RLS applies. ----------
create or replace function public.dm_thread(p_other uuid)
returns setof public.direct_messages
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select * from direct_messages
    where (sender_id = auth.uid() and recipient_id = p_other)
       or (sender_id = p_other and recipient_id = auth.uid())
    order by created_at desc
    limit 100
  ) t
  order by created_at;
$$;

-- ---------- Mark a conversation as read (only messages sent TO me) ----------
create or replace function public.mark_dm_read(p_other uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update direct_messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_other and read_at is null;
$$;

revoke all on function public.dm_threads() from public, anon;
revoke all on function public.dm_thread(uuid) from public, anon;
revoke all on function public.mark_dm_read(uuid) from public, anon;
grant execute on function public.dm_threads() to authenticated;
grant execute on function public.dm_thread(uuid) to authenticated;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ---------- Leaderboard: also return user_id so a row can open a DM ----------
-- (return type changes, so drop + recreate)
drop function if exists public.leaderboard();
create function public.leaderboard()
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
           count(*) filter (where had_sugar)     as sugar_days,
           count(*) filter (where not had_sugar) as clean_days,
           max(day)                              as last_day
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
