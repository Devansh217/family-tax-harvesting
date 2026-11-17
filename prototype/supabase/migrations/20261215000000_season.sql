-- Harvest season help: a clear switch on the family row, a log each family can read, and anonymous weekly totals.

-- 1. The switch, copied from the decrypted family on every save by the `family` function, so the weekly check can skip families that are off without decrypting them.
alter table public.families add column if not exists season_help boolean not null default false;

-- 2. Each automatic read or email, written by the server; each family sees its own rows.
create table if not exists public.season_log (
  id              bigint generated always as identity primary key,
  family_user_id  uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('season_check', 'email_start', 'email_weekly', 'email_deadline')),
  on_date         date not null,
  at              timestamptz not null default now(),
  unique (family_user_id, kind, on_date)
);
alter table public.season_log enable row level security;
revoke all on public.season_log from anon, authenticated;
grant select on public.season_log to authenticated;
drop policy if exists "season_log: read own" on public.season_log;
create policy "season_log: read own" on public.season_log
  for select to authenticated using (family_user_id = (select auth.uid()));
create index if not exists season_log_family on public.season_log (family_user_id, on_date desc);

-- 3. Beta-wide weekly totals, without names or user ids. Server only: no policies, nothing granted.
create table if not exists public.season_stats (
  week                     date primary key,
  families                 int,
  room_usable              bigint,
  room_used                bigint,
  used_share_by_family     numeric[],
  moves_shown              int,
  moves_dated              int,
  moves_done               int,
  moves_detected           int,
  families_with_detected   int
);
alter table public.season_stats enable row level security;
revoke all on public.season_stats from anon, authenticated;
