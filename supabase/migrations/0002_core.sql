-- Sendves phase 2: contacts, lists, campaigns, sends, events, suppression, domains,
-- abuse reports, platform settings, queue functions, reporting views.
-- Run AFTER 0001_init.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- Security model: members get SELECT-only access through RLS. Every write goes through
-- server actions that use the service-role key after checking workspace membership, so a
-- logged-in user cannot edit protected columns (plan, status, review_status) via the API.

-- ── Platform settings (single row) ────────────────────────────────
create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  pause_bounce_pct numeric not null default 5,
  pause_complaint_pct numeric not null default 0.3,
  suspend_complaint_pct numeric not null default 0.5,
  new_workspace_daily_limit integer not null default 200,
  new_workspace_max_contacts integer not null default 500
);
insert into public.platform_settings (id) values (1) on conflict do nothing;
alter table public.platform_settings enable row level security;
create policy "Admins read settings" on public.platform_settings for select using (public.is_admin());

-- ── Workspace additions ───────────────────────────────────────────
alter table public.workspaces
  add column if not exists track_opens boolean not null default true,
  add column if not exists billing_provider text,
  add column if not exists billing_ref text;

create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

-- ── Core tables ───────────────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned')),
  source text,
  consented_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index contacts_ws_status_idx on public.contacts (workspace_id, status);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  primary key (list_id, contact_id)
);
create index list_members_contact_idx on public.list_members (contact_id);

create table public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  domain text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  dkim_tokens text[] not null default '{}',
  dkim_ok boolean not null default false,
  spf_ok boolean not null default false,
  dmarc_ok boolean not null default false,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  subject text not null default '',
  preview_text text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  list_id uuid references public.lists (id) on delete set null,
  blocks jsonb not null default '[]'::jsonb,
  html text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')),
  review_status text not null default 'not_required'
    check (review_status in ('not_required', 'pending', 'approved', 'rejected')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  recipient_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index campaigns_ws_idx on public.campaigns (workspace_id, created_at desc);
create index campaigns_due_idx on public.campaigns (status, scheduled_at);

create table public.sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  email text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index sends_queue_idx on public.sends (status, run_at);
create index sends_msg_idx on public.sends (provider_message_id);
create index sends_ws_sent_idx on public.sends (workspace_id, sent_at);

create table public.events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  send_id uuid references public.sends (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  type text not null check (type in ('delivered', 'open', 'click', 'bounce', 'complaint', 'unsubscribe')),
  url text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index events_campaign_idx on public.events (campaign_id, type);
create index events_send_idx on public.events (send_id, type);

create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade, -- null = global
  email text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create unique index suppression_unique_idx
  on public.suppression_entries (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  reporter text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

-- ── Row level security: members read their own workspace data, nothing else ──
alter table public.contacts enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.sending_domains enable row level security;
alter table public.campaigns enable row level security;
alter table public.sends enable row level security;
alter table public.events enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.abuse_reports enable row level security;

create policy "Members read contacts" on public.contacts for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read lists" on public.lists for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read list members" on public.list_members for select using (
  exists (select 1 from public.lists l where l.id = list_id and (public.is_workspace_member(l.workspace_id) or public.is_admin()))
);
create policy "Members read domains" on public.sending_domains for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read campaigns" on public.campaigns for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read sends" on public.sends for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read events" on public.events for select using (public.is_workspace_member(workspace_id) or public.is_admin());
create policy "Members read own suppression" on public.suppression_entries for select using (
  (workspace_id is not null and public.is_workspace_member(workspace_id)) or public.is_admin()
);
create policy "Admins read abuse reports" on public.abuse_reports for select using (public.is_admin());

-- ── New users get a workspace automatically (replaces the 0001 trigger function) ──
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);

  select * into s from public.platform_settings where id = 1;

  insert into public.workspaces (name, owner_id, daily_send_limit, max_contacts)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'My') || '''s workspace',
    new.id,
    coalesce(s.new_workspace_daily_limit, 200),
    coalesce(s.new_workspace_max_contacts, 500)
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;

-- Backfill: users who registered before this migration get a workspace too.
do $$
declare r record; ws uuid;
begin
  for r in
    select p.id, p.full_name from public.profiles p
    where not exists (select 1 from public.workspace_members m where m.user_id = p.id)
  loop
    insert into public.workspaces (name, owner_id)
    values (coalesce(nullif(r.full_name, ''), 'My') || '''s workspace', r.id)
    returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, r.id, 'owner');
  end loop;
end $$;

-- ── Queue functions (service role only) ───────────────────────────
create or replace function public.enqueue_campaign(p_campaign uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.campaigns; n integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if c.id is null or c.status <> 'scheduled' then return 0; end if;

  insert into public.sends (campaign_id, workspace_id, contact_id, email)
  select c.id, c.workspace_id, ct.id, ct.email
  from public.contacts ct
  where ct.workspace_id = c.workspace_id
    and ct.status = 'subscribed'
    and (c.list_id is null or exists (
      select 1 from public.list_members lm where lm.list_id = c.list_id and lm.contact_id = ct.id))
    and not exists (
      select 1 from public.suppression_entries se
      where lower(se.email) = lower(ct.email) and (se.workspace_id is null or se.workspace_id = c.workspace_id))
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics n = row_count;

  update public.campaigns set status = 'sending', started_at = now(), recipient_count = n where id = c.id;
  return n;
end $$;

create or replace function public.claim_sends(batch_size integer)
returns setof public.sends language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.sends s
     set status = 'sending', locked_at = now(), attempts = s.attempts + 1
   where s.id in (
     select x.id from public.sends x
     join public.campaigns c on c.id = x.campaign_id
     join public.workspaces w on w.id = x.workspace_id
     where x.status = 'queued' and x.run_at <= now()
       and c.status = 'sending' and w.status <> 'suspended'
     order by x.run_at
     limit batch_size
     for update of x skip locked)
  returning s.*;
end $$;

create or replace function public.release_stuck_sends()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.sends set status = 'queued', locked_at = null
   where status = 'sending' and locked_at < now() - interval '5 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.enqueue_campaign(uuid) from public, anon, authenticated;
revoke execute on function public.claim_sends(integer) from public, anon, authenticated;
revoke execute on function public.release_stuck_sends() from public, anon, authenticated;

-- ── Reporting views (run with the caller's permissions) ───────────
create or replace view public.campaign_stats with (security_invoker = true) as
select
  c.id as campaign_id,
  c.workspace_id,
  (select count(*) from public.sends s where s.campaign_id = c.id and s.status in ('sent', 'delivered', 'bounced', 'complained')) as sent,
  (select count(*) from public.sends s where s.campaign_id = c.id and s.status = 'delivered') as delivered,
  (select count(*) from public.sends s where s.campaign_id = c.id and s.status = 'bounced') as bounced,
  (select count(*) from public.sends s where s.campaign_id = c.id and s.status = 'complained') as complained,
  (select count(*) from public.sends s where s.campaign_id = c.id and s.status = 'failed') as failed,
  (select count(distinct e.send_id) from public.events e where e.campaign_id = c.id and e.type = 'open') as opens,
  (select count(distinct e.send_id) from public.events e where e.campaign_id = c.id and e.type = 'click') as clicks,
  (select count(*) from public.events e where e.campaign_id = c.id and e.type = 'unsubscribe') as unsubscribes
from public.campaigns c;

create or replace view public.workspace_stats_30d with (security_invoker = true) as
select
  w.id as workspace_id,
  (select count(*) from public.sends s where s.workspace_id = w.id and s.sent_at > now() - interval '30 days') as sent_30d,
  (select count(*) from public.sends s where s.workspace_id = w.id and s.sent_at > now() - interval '30 days' and s.status = 'complained') as complaints_30d
from public.workspaces w;
