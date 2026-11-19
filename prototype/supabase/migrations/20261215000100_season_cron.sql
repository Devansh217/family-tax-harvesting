-- Season alerts: the daily call, and the one list the `alerts` function reads. Free tier only: Supabase Cron + pg_net.

-- 1. Families with season help on, with the confirmed sign-in email. Server only: readable by the service role, nothing else.
create or replace view public.season_alert_families as
  select f.user_id, u.email, f.version, f.envelope, f.updated_at
  from public.families f
  join auth.users u on u.id = f.user_id
  where f.season_help and u.email is not null and u.email_confirmed_at is not null;
revoke all on public.season_alert_families from public, anon, authenticated;
grant select on public.season_alert_families to service_role;

-- 2. The daily call at 05:30 UTC (11:00 IST). The URL and secret live in Vault (see docs/guides/beta-setup.md, Season emails).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('season-alerts', '30 5 * * *', $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_url'), headers := jsonb_build_object('x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_secret')), timeout_milliseconds := 120000) $$);
