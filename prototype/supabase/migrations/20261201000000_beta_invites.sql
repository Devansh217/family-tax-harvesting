-- Invite-only beta: only emails on this list (and admins) may load or save a family.
-- Filled and changed only by the admin function (service role); no one signed in can read or write it directly.
create table if not exists public.beta_invites (
  email       text primary key check (email = lower(email)),
  invited_at  timestamptz not null default now(),
  note        text
);
alter table public.beta_invites enable row level security;
revoke all on public.beta_invites from anon, authenticated;
