-- Sugar Tracker schema. Safe to re-run.

create table if not exists public.day_marks (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null,
  had_sugar  boolean     not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.day_marks enable row level security;

-- Users can read only their own rows. No insert/update/delete policies:
-- the only write path is mark_day() below.
drop policy if exists "read own marks" on public.day_marks;
create policy "read own marks" on public.day_marks
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.day_marks from anon, authenticated;
grant select on public.day_marks to authenticated;

create or replace function public.mark_day(p_day date, p_had_sugar boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
  max_sugar constant int := 3;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_day is null or p_had_sugar is null then
    raise exception 'Day and choice are required' using errcode = '22004';
  end if;

  -- One mark at a time per user, so parallel clicks cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select count(*) into v_count
  from day_marks where user_id = v_uid and had_sugar;

  if v_count > max_sugar then
    raise exception 'Your tracker is locked: you used all % chances.', max_sugar using errcode = 'P0001';
  end if;

  -- Latest calendar date anywhere on Earth is UTC+14.
  if p_day > ((now() at time zone 'UTC') + interval '14 hours')::date then
    raise exception 'You cannot mark a future day.' using errcode = 'P0001';
  end if;

  if exists (select 1 from day_marks where user_id = v_uid and day = p_day) then
    raise exception 'That day is already marked.' using errcode = 'P0001';
  end if;

  insert into day_marks (user_id, day, had_sugar) values (v_uid, p_day, p_had_sugar);

  if p_had_sugar then
    v_count := v_count + 1;
  end if;

  return json_build_object(
    'sugar_count', v_count,
    'max_sugar',   max_sugar,
    'locked',      v_count > max_sugar
  );
end;
$$;

revoke all on function public.mark_day(date, boolean) from public, anon;
grant execute on function public.mark_day(date, boolean) to authenticated;
