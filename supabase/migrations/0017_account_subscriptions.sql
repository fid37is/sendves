-- Sendves phase 17: one subscription per account, pooled contacts and emails, 14-day trial on every plan.
-- Run AFTER 0016, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
-- Deploy this BEFORE the application code that reads the new columns. Take a database backup first: the plan
-- rename below is the rollback boundary.
--
-- What this does
--   1. Adds the subscription record to the account's MAIN business row (the first workspace a person owns).
--      Businesses added later (account_workspace_id is set) carry no subscription of their own.
--   2. Adds optional per-business allocation caps. They are sub-limits inside the shared pool, never extra capacity.
--   3. Removes the Free plan and renames the catalogue (starter / growth / pro / custom) using the rule below.
--   4. Adds a database guard so concurrent imports can't push an account past its pooled contact limit.
--   5. Adds an event table so payment webhooks are processed once.
--
-- Migration rule for existing accounts (documented, applied once)
--   free   -> starter, 14-day trial starting at migration time (no permanent free tier). Data is untouched.
--   starter -> starter,  growth -> growth, scale -> custom. Paid accounts (billing_ref set) become 'active'.
--   scale  keeps its old numbers as entitlement overrides, so a Custom account loses nothing.
--   An account that has more businesses (or contacts) than its new plan covers is GRANDFATHERED: the excess is
--   written to entitlement_overrides so nothing is removed and nothing is blocked. Review these in the admin console.
--   Billing period start falls back to the main business's created_at day until the next provider webhook sets the
--   real dates. Usage windows therefore reset on that day of the month. Tell affected accounts if that date changes.
--
-- Plan numbers repeated in SQL below (contact_pool_limit) must equal src/config/plan-limits.ts.
-- tests/subscription-migration.test.ts checks that.

alter table public.workspaces alter column plan set default 'starter';

alter table public.workspaces
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete')),
  add column if not exists billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists pending_plan text check (pending_plan is null or pending_plan in ('starter', 'growth', 'pro')),
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists billing_price_id text,
  add column if not exists billing_currency text,
  add column if not exists entitlement_overrides jsonb not null default '{}'::jsonb,
  -- Snapshot of the account's pooled contact limit, kept in step with the plan by the application. Read only by the guard below.
  add column if not exists contact_pool_limit integer,
  -- Optional allocation inside the shared pool for THIS business. Null means "use any remaining shared capacity".
  add column if not exists contact_cap integer check (contact_cap is null or contact_cap >= 0),
  add column if not exists send_cap integer check (send_cap is null or send_cap >= 0),
  add column if not exists cap_mode text not null default 'hard' check (cap_mode in ('soft', 'hard')),
  add column if not exists entitlements_v2 boolean not null default false;
alter table public.workspaces alter column entitlements_v2 set default true;

create index if not exists workspaces_provider_customer_idx on public.workspaces (provider_customer_id) where provider_customer_id is not null;
create index if not exists workspaces_provider_subscription_idx on public.workspaces (provider_subscription_id) where provider_subscription_id is not null;
create index if not exists sends_ws_created_idx on public.sends (workspace_id, created_at);

-- Existing accounts ----------------------------------------------------------------------------------------------
do $$
declare ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
  from public.workspaces where entitlements_v2 = false and account_workspace_id is null;

  update public.workspaces w set
    plan = case w.plan when 'scale' then 'custom' when 'growth' then 'growth' else 'starter' end,
    subscription_status = case when w.billing_ref is not null then 'active' else 'trialing' end,
    trial_started_at = case when w.billing_ref is null then now() end,
    trial_ends_at = case when w.billing_ref is null then now() + interval '14 days' end,
    billing_period_start = case when w.billing_ref is not null then w.created_at end,
    entitlement_overrides = case when w.plan = 'scale'
      then jsonb_build_object('businesses', 10, 'contacts', 100000, 'monthlySends', 1000000, 'maxDaily', 100000, 'startDaily', 50000, 'domains', 50)
      else '{}'::jsonb end
  where w.id = any (ids);

  -- Grandfather accounts that are already bigger than their new plan.
  update public.workspaces m set entitlement_overrides = m.entitlement_overrides || jsonb_strip_nulls(jsonb_build_object(
    'businesses', case when (m.entitlement_overrides ->> 'businesses') is null and t.n > t.slots then t.n end,
    'contacts', case when (m.entitlement_overrides ->> 'contacts') is null and t.c > t.lim then t.c end))
  from (
    select w.id,
      1 + (select count(*) from public.workspaces b where b.account_workspace_id = w.id) as n,
      (select count(*) from public.contacts c join public.workspaces b on b.id = c.workspace_id where b.id = w.id or b.account_workspace_id = w.id) as c,
      case w.plan when 'starter' then 1 when 'growth' then 2 when 'pro' then 5 else 10 end as slots,
      case w.plan when 'starter' then 5000 when 'growth' then 27000 when 'pro' then 27000 else 100000 end as lim
    from public.workspaces w where w.id = any (ids)
  ) t
  where m.id = t.id;

  update public.workspaces m set contact_pool_limit = coalesce(
    (m.entitlement_overrides ->> 'contacts')::integer,
    case m.plan when 'starter' then 5000 when 'growth' then 27000 when 'pro' then 27000 else 100000 end)
  where m.id = any (ids);

  -- Businesses added under a main business follow its plan name (their per-business limits come from it).
  update public.workspaces c set plan = m.plan
  from public.workspaces m
  where c.account_workspace_id = m.id and c.entitlements_v2 = false;

  update public.workspaces set entitlements_v2 = true where entitlements_v2 = false;
end $$;

-- Pooled contact guard -------------------------------------------------------------------------------------------
-- The application checks the pool first and explains any shortfall. This is the last line of defence: it makes the
-- check atomic, so two imports running at once can't both squeeze past the limit. It serialises per account.
create or replace function public.enforce_contact_pool()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; lim integer; total bigint;
begin
  for r in
    select distinct coalesce(w.account_workspace_id, w.id) as main_id
    from new_rows n join public.workspaces w on w.id = n.workspace_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.main_id::text, 17));
    select contact_pool_limit into lim from public.workspaces where id = r.main_id;
    if lim is null then continue; end if;
    select count(*) into total
    from public.contacts c join public.workspaces w on w.id = c.workspace_id
    where w.id = r.main_id or w.account_workspace_id = r.main_id;
    if total > lim then
      raise exception 'contact_pool_exceeded' using errcode = 'P0001', detail = format('account %s has %s of %s contacts', r.main_id, total, lim);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists contacts_pool_guard on public.contacts;
create trigger contacts_pool_guard after insert on public.contacts
  referencing new table as new_rows for each statement execute function public.enforce_contact_pool();

-- New accounts: choose a plan, get a 14-day trial of it -----------------------------------------------------------
-- The plan comes from the sign-up form (user metadata "plan"). Custom needs approval, so it is never self-selected.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
  domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  chosen text := lower(coalesce(new.raw_user_meta_data ->> 'plan', ''));
begin
  select * into s from public.platform_settings where id = 1;

  if coalesce(new.raw_user_meta_data ->> 'invited', '') <> 'true' then
    if coalesce(s.registrations_open, true) is false then
      raise exception 'Sign-ups are closed right now.';
    end if;
    if domain <> '' and domain = any (coalesce(s.blocked_email_domains, '{}')) then
      raise exception 'That email domain isn''t accepted.';
    end if;
  end if;

  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);

  if coalesce(new.raw_user_meta_data ->> 'invited', '') = 'true' then
    return new;
  end if;

  if chosen not in ('starter', 'growth', 'pro') then chosen := 'starter'; end if;

  insert into public.workspaces (
    name, owner_id, status, daily_send_limit, max_contacts,
    plan, subscription_status, trial_started_at, trial_ends_at, contact_pool_limit, entitlements_v2
  )
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'My') || '''s workspace',
    new.id,
    case when coalesce(s.require_review, true) then 'review' else 'active' end,
    coalesce(s.new_workspace_daily_limit, 200),
    coalesce(s.new_workspace_max_contacts, 500),
    chosen, 'trialing', now(), now() + interval '14 days',
    case chosen when 'starter' then 5000 else 27000 end,
    true
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;

-- Payment webhooks are retried by the providers. Each event id is recorded once so a repeat changes nothing.
create table if not exists public.billing_events (
  id text primary key,
  provider text not null,
  type text,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security; -- no policies: only the service role reads or writes it
