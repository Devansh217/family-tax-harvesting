-- Whether the email for a season_log row actually went out. The row exists from the moment the server reads the family;
-- a family with nothing to act on is read but not emailed.
alter table public.season_log add column if not exists sent boolean not null default false;
