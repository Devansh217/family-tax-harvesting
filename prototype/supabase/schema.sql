-- Harvesting: database setup for the OLD project only (plain family_data). Superseded by supabase/migrations/,
-- which the new Mumbai project uses (encrypted families, server functions). Kept until the old project is deleted.
-- Harvesting: database setup for login and saving a family's data to their account.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this whole file → Run.
-- Safe to run again: every statement checks before creating.
--
-- What it creates
--   profiles     one row per signed-in person: first and last name
--   family_data  one row per person: their whole family (members, imported transactions, plan ticks, history)
-- Row-level security means each person can only ever read or change their own rows. The app's publishable key
-- cannot see anyone else's data, and anonymous visitors can see nothing.

-- 1. Profiles -------------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '' check (char_length(first_name) <= 80),
  last_name   text not null default '' check (char_length(last_name) <= 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- A profile is created automatically at sign-up. Email sign-ups send first_name / last_name. Google may send
-- given_name / family_name (directly or under custom_claims), or only a full name, which is split at the first space.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := trim(coalesce(meta ->> 'full_name', meta ->> 'name', ''));
  first_part text := nullif(split_part(full_name, ' ', 1), '');
  rest_part text := nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), '');
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    left(coalesce(nullif(meta ->> 'first_name', ''), nullif(meta ->> 'given_name', ''), nullif(meta -> 'custom_claims' ->> 'given_name', ''), first_part, ''), 80),
    left(coalesce(nullif(meta ->> 'last_name', ''), nullif(meta ->> 'family_name', ''), nullif(meta -> 'custom_claims' ->> 'family_name', ''), rest_part, ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Family data ----------------------------------------------------------------------------------------------
-- The app's whole state as one JSON document per person, with a version number so two devices editing at once
-- cannot silently overwrite each other (the app sends the version it last saw).
create table if not exists public.family_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  state       jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  constraint family_data_size check (pg_column_size(state) < 5 * 1024 * 1024)
);

alter table public.family_data enable row level security;

drop policy if exists "family_data: read own" on public.family_data;
create policy "family_data: read own" on public.family_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "family_data: insert own" on public.family_data;
create policy "family_data: insert own" on public.family_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "family_data: update own" on public.family_data;
create policy "family_data: update own" on public.family_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "family_data: delete own" on public.family_data;
create policy "family_data: delete own" on public.family_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3. Keep updated_at current ----------------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists family_data_touch on public.family_data;
create trigger family_data_touch before update on public.family_data
  for each row execute function public.touch_updated_at();

-- 4. No access for signed-out visitors ------------------------------------------------------------------------
revoke all on public.profiles, public.family_data from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.family_data to authenticated;

-- 5. Backfill names for people who signed up before the name fix (safe to run again) ----------------------------
update public.profiles p
set
  first_name = left(coalesce(
    nullif(p.first_name, ''),
    nullif(u.raw_user_meta_data ->> 'given_name', ''),
    nullif(u.raw_user_meta_data -> 'custom_claims' ->> 'given_name', ''),
    nullif(split_part(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
    ''), 80),
  last_name = left(coalesce(
    nullif(p.last_name, ''),
    nullif(u.raw_user_meta_data ->> 'family_name', ''),
    nullif(u.raw_user_meta_data -> 'custom_claims' ->> 'family_name', ''),
    nullif(trim(substr(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')),
      length(split_part(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ' ', 1)) + 1)), ''),
    ''), 80)
from auth.users u
where u.id = p.id and (p.first_name = '' or p.last_name = '');
