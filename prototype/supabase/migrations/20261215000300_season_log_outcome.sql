-- How each season_log row ended, so a same-day re-run retries only a failed email and never sends one twice.
-- outcome: null while the run that wrote the row is still working (or died mid-way: never retried);
-- 'sent', 'nothing_to_send' or 'failed' once the attempt ends. `sent` stays in step (sent = outcome = 'sent').
-- retrying: set by a conditional update (where outcome = 'failed' and not retrying) so only one run retries a row.
alter table public.season_log add column if not exists outcome text check (outcome in ('sent', 'nothing_to_send', 'failed'));
alter table public.season_log add column if not exists retrying boolean not null default false;
update public.season_log set outcome = 'sent' where sent and outcome is null;
-- The alerts function reads admins (service role) to limit a rehearsal run to the admins' own families.
grant select on public.admins to service_role;
