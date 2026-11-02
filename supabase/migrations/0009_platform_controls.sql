-- Sendves phase 9: platform controls.
-- Run AFTER 0008_*.sql, in the Supabase SQL editor (or `supabase db push`).
--
--  1. More platform settings: enforcement window and minimum sample, a platform-wide sending pause,
--     open/closed registration, whether new workspaces start in review, blocked email domains.
--  2. New workspaces start in review only when the "require review" setting is on, and sign-ups
--     are refused when registration is closed or the email domain is blocked.
--  3. Platform admins are not customers: empty workspaces that were auto-created for admin accounts
--     are removed. A workspace with any contacts, campaigns or domains is never touched.
--  4. workspace_health(): sends, bounces and complaints per workspace over a rolling window. The
--     worker uses it so bounces and complaints that arrive after a campaign finishes still count.

-- If an earlier copy of this migration already ran with the column named min_sample, rename it.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_settings' and column_name = 'min_sample') then
    alter table public.platform_settings rename column min_sample to health_min_sample;
  end if;
end $$;

alter table public.platform_settings
  add column if not exists health_min_sample integer not null default 50,
  add column if not exists window_days integer not null default 7,
  add column if not exists sending_paused boolean not null default false,
  add column if not exists registrations_open boolean not null default true,
  add column if not exists require_review boolean not null default true,
  add column if not exists blocked_email_domains text[] not null default '{}';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
  domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  select * into s from public.platform_settings where id = 1;

  -- Invited people and admins created from the console are added by the service role with
  -- invited = 'true'. Everyone else is a self-registration and follows the sign-up rules.
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

  insert into public.workspaces (name, owner_id, status, daily_send_limit, max_contacts)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'My') || '''s workspace',
    new.id,
    case when coalesce(s.require_review, true) then 'review' else 'active' end,
    coalesce(s.new_workspace_daily_limit, 200),
    coalesce(s.new_workspace_max_contacts, 500)
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;

-- Admins don't get customer workspaces. Remove the empty ones that already exist.
delete from public.workspaces w
using public.profiles p
where p.id = w.owner_id
  and p.role = 'admin'
  and not exists (select 1 from public.campaigns c where c.workspace_id = w.id)
  and not exists (select 1 from public.contacts c where c.workspace_id = w.id)
  and not exists (select 1 from public.sending_domains d where d.workspace_id = w.id)
  and (select count(*) from public.workspace_members m where m.workspace_id = w.id) <= 1;

create or replace function public.workspace_health(p_days integer)
returns table (workspace_id uuid, sent bigint, bounced bigint, complained bigint)
language sql stable security definer set search_path = public as $$
  select s.workspace_id,
         count(*) filter (where s.status in ('sent', 'delivered', 'bounced', 'complained')),
         count(*) filter (where s.status = 'bounced'),
         count(*) filter (where s.status = 'complained')
  from public.sends s
  where s.sent_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
  group by s.workspace_id
$$;
revoke execute on function public.workspace_health(integer) from public, anon, authenticated;
