-- Season alerts only for invited families (and admins), like every family load and save.
-- Before this, a family whose invite was removed kept getting season reads and emails, and could not turn them off:
-- its saves are refused, so families.season_help stayed on. Removing the invite now stops them at the next daily run.
-- Same columns as before, so `create or replace` keeps the view in place for the `alerts` function.
create or replace view public.season_alert_families as
  select f.user_id, u.email, f.version, f.envelope, f.updated_at
  from public.families f
  join auth.users u on u.id = f.user_id
  where f.season_help and u.email is not null and u.email_confirmed_at is not null
    and (exists (select 1 from public.beta_invites i where i.email = lower(u.email))
         or exists (select 1 from public.admins a where a.user_id = f.user_id));
revoke all on public.season_alert_families from public, anon, authenticated;
grant select on public.season_alert_families to service_role;
