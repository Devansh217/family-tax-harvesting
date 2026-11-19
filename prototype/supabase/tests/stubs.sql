-- The few Supabase pieces the migrations lean on, for a throwaway local Postgres. Never run this on a real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id                  uuid primary key,
  email               text,
  email_confirmed_at  timestamptz
);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
