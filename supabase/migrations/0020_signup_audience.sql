-- Sendves phase 20: the audience size chosen on the pricing page now follows the person through sign-up.
-- Run AFTER 0019, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
--
-- The sign-up form posts the plan AND the audience size (contacts) picked on /pricing; the application stores both in the
-- new user's metadata. This replaces handle_new_user() so the trial account starts on that audience size:
--   workspaces.audience_contacts   the audience size picked (null when none was sent, as before)
--   workspaces.contact_pool_limit  that audience size, instead of the plan's fixed 5,000 / 27,000
-- The audience size is checked against the sizes we sell. Anyone can call Supabase sign-up directly with any metadata, so
-- an unknown or out-of-range number is ignored and the account falls back to the plan's own numbers.
-- The list below must equal AUDIENCE_STEPS in src/config/plan-limits.ts (tests/audience-pricing.test.ts checks it).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
  domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  chosen text := lower(coalesce(new.raw_user_meta_data ->> 'plan', ''));
  picked text := coalesce(new.raw_user_meta_data ->> 'audience', '');
  audience integer;
  audience_steps constant integer[] := array[500, 1000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 65000, 70000, 75000, 80000, 85000, 90000, 95000, 100000, 105000, 110000, 115000, 120000, 125000, 130000, 135000, 140000, 145000, 150000, 155000, 160000, 165000, 170000, 175000, 180000, 185000, 200000];
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

  -- Whole numbers only, and only a size we sell.
  if picked ~ '^[0-9]{1,6}$' and picked::integer = any (audience_steps) then
    audience := picked::integer;
  end if;

  insert into public.workspaces (
    name, owner_id, status, daily_send_limit, max_contacts,
    plan, subscription_status, trial_started_at, trial_ends_at, contact_pool_limit, audience_contacts, entitlements_v2
  )
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'My') || '''s workspace',
    new.id,
    case when coalesce(s.require_review, true) then 'review' else 'active' end,
    coalesce(s.new_workspace_daily_limit, 200),
    coalesce(s.new_workspace_max_contacts, 500),
    chosen, 'trialing', now(), now() + interval '14 days',
    coalesce(audience, case chosen when 'starter' then 5000 else 27000 end),
    audience,
    true
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;
