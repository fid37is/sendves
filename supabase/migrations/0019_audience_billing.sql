-- Sendves phase 19: audience-size billing. A subscription now has a plan AND an audience size (contacts), and the
-- price follows both. Run AFTER 0018, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
-- Deploy this BEFORE the application code that reads the new columns.
--
--   audience_contacts          The audience size the account bought, on its MAIN business (like the rest of the subscription).
--                              Pooled contacts = this number and pooled emails = this number x 12 (src/config/plan-limits.ts).
--                              Null means the account predates audience pricing and keeps its plan's own numbers, so no
--                              existing account gains or loses anything from this migration.
--   pending_audience_contacts  The audience size scheduled to start with pending_plan at the next renewal (a downgrade).
--   billing_plan_codes         Paystack bills a plan code at one fixed amount, so each plan + audience + interval needs its
--                              own code. The application creates them in Paystack on demand and remembers them here.

alter table public.workspaces
  add column if not exists audience_contacts integer check (audience_contacts is null or audience_contacts > 0),
  add column if not exists pending_audience_contacts integer check (pending_audience_contacts is null or pending_audience_contacts > 0);

create table if not exists public.billing_plan_codes (
  provider text not null,
  key text not null,
  code text not null,
  created_at timestamptz not null default now(),
  primary key (provider, key)
);
alter table public.billing_plan_codes enable row level security; -- no policies: only the service role reads or writes it
