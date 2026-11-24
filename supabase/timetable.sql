-- Day planner: custom time blocks with to-dos and notes. Private to each user. Safe to re-run.

create table if not exists public.time_blocks (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  day        date        not null,
  start_min  smallint    not null check (start_min between 0 and 1439),     -- minutes after midnight
  end_min    smallint    not null check (end_min between 1 and 1440),       -- 1440 = midnight at the end of the day
  title      text        not null check (char_length(btrim(title)) between 1 and 120),
  notes      text        not null default '' check (char_length(notes) <= 2000),
  tag        text        not null default 'other' check (tag in ('work', 'health', 'me', 'learn', 'other')),
  done       boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_min > start_min)
);

create index if not exists time_blocks_user_day on public.time_blocks (user_id, day, start_min);

alter table public.time_blocks enable row level security;

-- Only you can see and change your own plan.
drop policy if exists "own blocks: read"   on public.time_blocks;
drop policy if exists "own blocks: insert" on public.time_blocks;
drop policy if exists "own blocks: update" on public.time_blocks;
drop policy if exists "own blocks: delete" on public.time_blocks;
create policy "own blocks: read"   on public.time_blocks for select to authenticated using (user_id = auth.uid());
create policy "own blocks: insert" on public.time_blocks for insert to authenticated with check (user_id = auth.uid());
create policy "own blocks: update" on public.time_blocks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own blocks: delete" on public.time_blocks for delete to authenticated using (user_id = auth.uid());

revoke all on public.time_blocks from anon;
grant select, insert, update, delete on public.time_blocks to authenticated;

-- Keep updated_at current. (search_path pinned, per the Supabase linter.)
create or replace function public.touch_time_block()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists time_blocks_touch on public.time_blocks;
create trigger time_blocks_touch before update on public.time_blocks
  for each row execute function public.touch_time_block();
