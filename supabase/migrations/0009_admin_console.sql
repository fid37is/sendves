-- Sendves phase 9: admin console controls.
-- Run AFTER 0008, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
--
--  1. New platform settings (review gate, global sending switch, open sign-ups, enforcement sample/window).
--  2. Platform admins never own a customer workspace: existing empty ones are removed, and promoting someone
--     to admin removes their empty personal workspace automatically.
--  3. The sign-up trigger honours the new settings.

-- ── 1. Settings ───────────────────────────────────────────────────────────────
alter table public.platform_settings
  add column if not exists review_new_workspaces boolean not null default true,
  add column if not exists sending_paused boolean not null default false,
  add column if not exists signups_open boolean not null default true,
  add column if not exists health_min_sample integer not null default 50 check (health_min_sample >= 1),
  add column if not exists health_window_hours integer not null default 72 check (health_window_hours between 1 and 720);

-- Remembers what automatic enforcement already did for a campaign, so an admin's decision (reinstating a
-- workspace, resuming a campaign) is not overruled on the next pass by the same numbers.
alter table public.campaigns add column if not exists health_action text check (health_action in ('pause', 'suspend'));

-- ── 2. Admins do not own workspaces ───────────────────────────────────────────
-- Removes the person's personal workspace ONLY when it is untouched: they are its only member and it has
-- no contacts, campaigns or sending domains. Anything with data in it is left alone for a human to decide.
create or replace function public.prune_admin_workspace(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  with doomed as (
    select w.id from public.workspaces w
    where w.owner_id = p_user
      and (select count(*) from public.workspace_members m where m.workspace_id = w.id) <= 1
      and not exists (select 1 from public.contacts c where c.workspace_id = w.id)
      and not exists (select 1 from public.campaigns c where c.workspace_id = w.id)
      and not exists (select 1 from public.sending_domains d where d.workspace_id = w.id)
  ), gone as (
    delete from public.workspaces w using doomed where w.id = doomed.id returning w.id
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;
revoke execute on function public.prune_admin_workspace(uuid) from public, anon, authenticated;
grant execute on function public.prune_admin_workspace(uuid) to service_role;

-- Promoting someone to admin (from the console or by SQL) cleans up their empty workspace.
create or replace function public.on_profile_promoted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.prune_admin_workspace(new.id);
  return new;
end;
$$;
drop trigger if exists profile_promoted on public.profiles;
create trigger profile_promoted
  after update of role on public.profiles
  for each row when (new.role = 'admin' and old.role is distinct from 'admin')
  execute function public.on_profile_promoted();

-- One-time clean-up for admins that already have an empty workspace.
select public.prune_admin_workspace(id) from public.profiles where role = 'admin';

-- ── 3. Sign-up trigger ────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
  invited boolean := coalesce(new.raw_user_meta_data ->> 'invited', '') = 'true';
begin
  select * into s from public.platform_settings where id = 1;

  -- Hard stop for closed sign-ups, so the API cannot be used to get around the form. Accounts created by an
  -- organization invitation or by an admin are always allowed.
  if not invited and coalesce(s.signups_open, true) = false then
    raise exception 'New sign-ups are paused.';
  end if;

  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);

  -- Invited people join the organization that invited them and do not get a personal workspace.
  if invited then
    return new;
  end if;

  insert into public.workspaces (name, owner_id, daily_send_limit, max_contacts, status)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'My') || '''s workspace',
    new.id,
    coalesce(s.new_workspace_daily_limit, 200),
    coalesce(s.new_workspace_max_contacts, 500),
    case when coalesce(s.review_new_workspaces, true) then 'review' else 'active' end
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;
