-- Sendves phase 3: analytics functions, admin audit log, and security hardening.
-- Run AFTER 0002_core.sql, in the Supabase SQL editor (or `supabase db push`).

-- ── Security: users may only edit their display name ──────────────────────────
-- The 0001 policy let a signed-in user update any column except `role` straight through the
-- public API (including `email`, which webhooks use for matching). Column privileges close that.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- ── Admin audit log ───────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "Admins read audit log" on public.audit_log;
create policy "Admins read audit log" on public.audit_log for select using (public.is_admin());
-- Append-only: nobody (not even admins through the API) can edit or delete entries.
revoke insert, update, delete on public.audit_log from authenticated, anon;

-- ── Campaign stats: add total (not only unique) clicks ────────────────────────
-- New columns are appended at the end so existing queries keep working.
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
  (select count(*) from public.events e where e.campaign_id = c.id and e.type = 'unsubscribe') as unsubscribes,
  (select count(*) from public.events e where e.campaign_id = c.id and e.type = 'click') as total_clicks
from public.campaigns c;

-- ── Analytics functions (service role only) ───────────────────────────────────
-- p_workspace = null means the whole platform (admin console only).

create or replace function public.daily_activity(p_days integer, p_workspace uuid default null, p_campaign uuid default null)
returns table (bucket date, sent bigint, delivered bigint, bounced bigint, complaints bigint, opens bigint, clicks bigint, unique_clicks bigint, unsubscribes bigint)
language sql security definer set search_path = public stable as $$
  with span as (select greatest(least(coalesce(p_days, 30), 365), 1) as n),
  days as (
    select d::date as bucket from span, generate_series(current_date - (span.n - 1), current_date, interval '1 day') d
  ),
  s as (
    select sent_at::date as bucket,
           count(*) as sent,
           count(*) filter (where status = 'delivered') as delivered,
           count(*) filter (where status = 'bounced') as bounced,
           count(*) filter (where status = 'complained') as complaints
    from public.sends, span
    where sent_at >= current_date - (span.n - 1)
      and (p_workspace is null or workspace_id = p_workspace)
      and (p_campaign is null or campaign_id = p_campaign)
    group by 1
  ),
  e as (
    select created_at::date as bucket,
           count(*) filter (where type = 'open') as opens,
           count(*) filter (where type = 'click') as clicks,
           count(distinct send_id) filter (where type = 'click') as unique_clicks,
           count(*) filter (where type = 'unsubscribe') as unsubscribes
    from public.events, span
    where created_at >= current_date - (span.n - 1)
      and (p_workspace is null or workspace_id = p_workspace)
      and (p_campaign is null or campaign_id = p_campaign)
    group by 1
  )
  select d.bucket,
         coalesce(s.sent, 0), coalesce(s.delivered, 0), coalesce(s.bounced, 0), coalesce(s.complaints, 0),
         coalesce(e.opens, 0), coalesce(e.clicks, 0), coalesce(e.unique_clicks, 0), coalesce(e.unsubscribes, 0)
  from days d left join s on s.bucket = d.bucket left join e on e.bucket = d.bucket
  order by d.bucket;
$$;

create or replace function public.link_clicks(p_workspace uuid, p_campaign uuid default null, p_days integer default 30, p_limit integer default 10)
returns table (url text, clicks bigint, unique_clicks bigint)
language sql security definer set search_path = public stable as $$
  select e.url, count(*) as clicks, count(distinct e.send_id) as unique_clicks
  from public.events e
  where e.type = 'click' and e.url is not null
    and e.workspace_id = p_workspace
    and (p_campaign is null or e.campaign_id = p_campaign)
    and (p_campaign is not null or e.created_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1)))
  group by e.url
  order by count(*) desc
  limit greatest(least(coalesce(p_limit, 10), 100), 1);
$$;

create or replace function public.top_workspaces(p_days integer default 30, p_limit integer default 10)
returns table (workspace_id uuid, name text, plan text, status text, sent bigint, bounced bigint, complaints bigint, clicks bigint)
language sql security definer set search_path = public stable as $$
  with span as (select now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1)) as since),
  s as (
    select workspace_id,
           count(*) as sent,
           count(*) filter (where status = 'bounced') as bounced,
           count(*) filter (where status = 'complained') as complaints
    from public.sends, span where sent_at >= span.since group by 1
  ),
  c as (
    select workspace_id, count(distinct send_id) as clicks
    from public.events, span where type = 'click' and created_at >= span.since group by 1
  )
  select w.id, w.name, w.plan, w.status, s.sent, coalesce(s.bounced, 0), coalesce(s.complaints, 0), coalesce(c.clicks, 0)
  from s join public.workspaces w on w.id = s.workspace_id left join c on c.workspace_id = s.workspace_id
  order by s.sent desc
  limit greatest(least(coalesce(p_limit, 10), 100), 1);
$$;

-- One round trip for the admin KPI row. Compares the period with the one before it.
create or replace function public.platform_summary(p_days integer default 30)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  n integer := greatest(least(coalesce(p_days, 30), 365), 1);
  cur timestamptz := now() - make_interval(days => n);
  prev timestamptz := now() - make_interval(days => n * 2);
  result jsonb;
begin
  select jsonb_build_object(
    'workspaces', (select count(*) from public.workspaces),
    'new_workspaces', (select count(*) from public.workspaces where created_at >= cur),
    'new_workspaces_prev', (select count(*) from public.workspaces where created_at >= prev and created_at < cur),
    'users', (select count(*) from public.profiles),
    'new_users', (select count(*) from public.profiles where created_at >= cur),
    'paid_workspaces', (select count(*) from public.workspaces where plan <> 'free'),
    'active_senders', (select count(distinct workspace_id) from public.sends where sent_at >= cur),
    'contacts', (select count(*) from public.contacts),
    'sent', (select count(*) from public.sends where sent_at >= cur),
    'sent_prev', (select count(*) from public.sends where sent_at >= prev and sent_at < cur),
    'delivered', (select count(*) from public.sends where sent_at >= cur and status = 'delivered'),
    'bounced', (select count(*) from public.sends where sent_at >= cur and status = 'bounced'),
    'bounced_prev', (select count(*) from public.sends where sent_at >= prev and sent_at < cur and status = 'bounced'),
    'complaints', (select count(*) from public.sends where sent_at >= cur and status = 'complained'),
    'complaints_prev', (select count(*) from public.sends where sent_at >= prev and sent_at < cur and status = 'complained'),
    'clicks', (select count(distinct send_id) from public.events where type = 'click' and created_at >= cur),
    'clicks_prev', (select count(distinct send_id) from public.events where type = 'click' and created_at >= prev and created_at < cur),
    'total_clicks', (select count(*) from public.events where type = 'click' and created_at >= cur),
    'unsubscribes', (select count(*) from public.events where type = 'unsubscribe' and created_at >= cur),
    'queued', (select count(*) from public.sends where status in ('queued', 'sending')),
    'failed', (select count(*) from public.sends where status = 'failed' and created_at >= cur),
    'open_abuse', (select count(*) from public.abuse_reports where status = 'open'),
    'pending_review', (select count(*) from public.campaigns where review_status = 'pending'),
    'suspended', (select count(*) from public.workspaces where status = 'suspended'),
    'plans', coalesce((select jsonb_object_agg(plan, c) from (select plan, count(*) as c from public.workspaces group by plan) p), '{}'::jsonb)
  ) into result;
  return result;
end $$;

revoke execute on function public.daily_activity(integer, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.link_clicks(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.top_workspaces(integer, integer) from public, anon, authenticated;
revoke execute on function public.platform_summary(integer) from public, anon, authenticated;
grant execute on function public.daily_activity(integer, uuid, uuid) to service_role;
grant execute on function public.link_clicks(uuid, uuid, integer, integer) to service_role;
grant execute on function public.top_workspaces(integer, integer) to service_role;
grant execute on function public.platform_summary(integer) to service_role;

create index if not exists events_ws_type_created_idx on public.events (workspace_id, type, created_at desc);
create index if not exists sends_sent_at_idx on public.sends (sent_at);
