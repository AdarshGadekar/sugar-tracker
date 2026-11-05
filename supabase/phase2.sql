-- Phase 2: only past days can be marked ("today isn't over yet").
-- The browser sends its IANA time zone (e.g. 'Asia/Kolkata'); unknown zones fall back to UTC.
-- Replaces the 2-argument mark_day (an overload would make 2-argument calls ambiguous).
-- The default for p_tz keeps the currently deployed site working until it is redeployed.
-- NOT yet applied to the live project.

drop function if exists public.mark_day(date, boolean);

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

  return json_build_object(
    'sugar_count', v_count,
    'max_sugar',   max_sugar,
    'locked',      v_count > max_sugar
  );
end;
$$;

revoke all on function public.mark_day(date, boolean, text) from public, anon;
grant execute on function public.mark_day(date, boolean, text) to authenticated;
