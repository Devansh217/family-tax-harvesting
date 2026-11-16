-- Secure storage (17 Nov 2026), for the new Mumbai project. Spec: docs/superpowers/specs/2026-11-17-secure-storage-design.md
-- Families are stored encrypted and reached only through the `family` and `admin` server functions (service role).
-- The browser can read its own profile and the log of admin reads about its family, nothing else.

-- 1. Profiles (as before: first and last name of the account holder) -----------------------------------------
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


revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

-- 2. Families: one encrypted envelope per account. No policies and no grants: only the service role reaches it.
create table if not exists public.families (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  version     integer not null check (version > 0),
  envelope    jsonb not null,
  updated_at  timestamptz not null default now(),
  constraint families_envelope_size check (pg_column_size(envelope) < 7 * 1024 * 1024)
);
alter table public.families enable row level security;
revoke all on public.families from anon, authenticated;
drop trigger if exists families_touch on public.families;
create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();

-- 3. Admin reads: written by the admin function before any family is decrypted; each family sees its own rows.
create table if not exists public.admin_reads (
  id              bigint generated always as identity primary key,
  family_user_id  uuid not null,
  admin_user_id   uuid not null,
  reason          text not null check (char_length(reason) between 3 and 300),
  at              timestamptz not null default now()
);
alter table public.admin_reads enable row level security;
revoke all on public.admin_reads from anon, authenticated;
grant select on public.admin_reads to authenticated;
drop policy if exists "admin_reads: read own" on public.admin_reads;
create policy "admin_reads: read own" on public.admin_reads
  for select to authenticated using (family_user_id = (select auth.uid()));
create index if not exists admin_reads_family on public.admin_reads (family_user_id, at desc);

-- 4. Admins: who may call the admin function. Filled by hand (the founder's user id).
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
