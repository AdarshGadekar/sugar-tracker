-- Chat room: one group room for all signed-in users + automatic milestone posts.
-- NOT yet applied to the live project.

-- ---------- Table ----------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade default auth.uid(),
  name       text not null default 'Player',
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  kind       text not null default 'user' check (kind in ('user', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

alter table public.messages enable row level security;

drop policy if exists "read messages" on public.messages;
create policy "read messages" on public.messages
  for select to authenticated using (true);

-- People can only post as themselves, and never as "system".
drop policy if exists "post own messages" on public.messages;
create policy "post own messages" on public.messages
  for insert to authenticated with check (user_id = auth.uid() and kind = 'user');

drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages" on public.messages
  for delete to authenticated using (user_id = auth.uid() and kind = 'user');

revoke all on public.messages from anon;
revoke update on public.messages from authenticated;
grant select, insert, delete on public.messages to authenticated;

-- ---------- Server-filled fields + anti-spam ----------
-- Display name comes from the account (can't be spoofed), time is server time,
-- and each person can post at most once every 2 seconds.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if new.kind = 'user' then
    new.user_id := auth.uid();
    new.body := btrim(new.body);
    select coalesce(nullif(btrim(raw_user_meta_data->>'name'), ''), 'Player')
      into new.name from auth.users where id = new.user_id;
    if exists (select 1 from messages
               where user_id = new.user_id and kind = 'user'
                 and created_at > now() - interval '2 seconds') then
      raise exception 'Slow down a little — one message every 2 seconds.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Live updates to every open browser.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ---------- Milestone posts from mark_day ----------
-- Same rules as phase2.sql, plus a system message for:
--   * no-sugar streak milestones (3, 7, 14, 21, 30, 50, 100) when marking yesterday
--   * losing a life, last life used, game over
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
  from day_marks where user_id = v_uid and had_sugar;

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
      -- consecutive no-sugar days ending yesterday
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

  return json_build_object(
    'sugar_count', v_count,
    'max_sugar',   max_sugar,
    'locked',      v_count > max_sugar
  );
end;
$$;

revoke all on function public.mark_day(date, boolean, text) from public, anon;
grant execute on function public.mark_day(date, boolean, text) to authenticated;
