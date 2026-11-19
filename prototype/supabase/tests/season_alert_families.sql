-- Who gets season reads and emails: only families with season help on, a confirmed email, and an invite (or an admin).
-- Runs after stubs.sql and the migrations. Any failed check stops the run with an error.

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'Invited@Example.com', now()),  -- invited (any letter case), help on: listed
  ('00000000-0000-0000-0000-000000000002', 'stranger@example.com', now()), -- not invited, help on: not listed
  ('00000000-0000-0000-0000-000000000003', 'founder@example.com', now()),  -- admin, not invited, help on: listed
  ('00000000-0000-0000-0000-000000000004', 'quiet@example.com', now()),    -- invited, help off: not listed
  ('00000000-0000-0000-0000-000000000005', 'new@example.com', null),       -- invited, email not confirmed: not listed
  ('00000000-0000-0000-0000-000000000006', 'removed@example.com', now());  -- invite removed, help on: not listed

insert into public.families (user_id, version, envelope, season_help)
select id, 1, '{}'::jsonb, id <> '00000000-0000-0000-0000-000000000004' from auth.users;

insert into public.beta_invites (email) values
  ('invited@example.com'), ('quiet@example.com'), ('new@example.com'), ('removed@example.com');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-000000000003');
delete from public.beta_invites where email = 'removed@example.com';

do $$
declare got text;
begin
  select string_agg(email, ', ' order by lower(email)) into got from public.season_alert_families;
  assert got = 'founder@example.com, Invited@Example.com',
    format('season_alert_families lists: %s', coalesce(got, '(nobody)'));

  assert has_table_privilege('service_role', 'public.season_alert_families', 'select'),
    'service_role must be able to read season_alert_families';
  assert not has_table_privilege('authenticated', 'public.season_alert_families', 'select'),
    'signed-in users must not read season_alert_families';
  assert not has_table_privilege('anon', 'public.season_alert_families', 'select'),
    'anonymous users must not read season_alert_families';
end $$;

select 'season_alert_families: ok' as result;
