-- Sendves phase 18: promo codes.
-- Run AFTER 0017. Safe to run more than once.
--
-- A code takes a percentage off a new subscription. The same codes work for Stripe (as a coupon created at checkout)
-- and Paystack (as a discounted first payment). Each account can redeem a given code once. Only the service role
-- touches these tables, and a redemption is recorded only after the payment is confirmed.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  percent_off integer not null check (percent_off between 1 and 100),
  duration text not null default 'once' check (duration in ('once', 'repeating', 'forever')),
  duration_months integer check (duration_months is null or duration_months between 1 and 36),
  -- null = every self-serve plan / both billing intervals
  plans text[],
  interval text check (interval is null or interval in ('month', 'year')),
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions >= 1),
  redeemed_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  check (duration <> 'repeating' or duration_months is not null)
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes (id) on delete cascade,
  -- the account's main business
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text,
  ref text,
  redeemed_at timestamptz not null default now(),
  unique (promo_id, workspace_id)
);

alter table public.promo_codes enable row level security;       -- no policies: service role only
alter table public.promo_redemptions enable row level security; -- no policies: service role only

-- Records a redemption once per account and counts it. False means this account had already used the code.
create or replace function public.redeem_promo(p_promo uuid, p_workspace uuid, p_provider text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.promo_redemptions (promo_id, workspace_id, provider, ref)
  values (p_promo, p_workspace, p_provider, p_ref)
  on conflict (promo_id, workspace_id) do nothing;
  if not found then return false; end if;
  update public.promo_codes set redeemed_count = redeemed_count + 1 where id = p_promo;
  return true;
end;
$$;
