-- Sendves phase 7: accounts created by invitation.
-- Run AFTER 0006_team_roles_and_aliases.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- A team member does NOT sign in with a personal email. The owner creates their company email
-- (jon@domain.com) and invites them on their personal email. The person opens the invitation and sets a
-- password for the company email, which is their login. The personal email is kept only as the
-- recovery email: it receives the invitation and password-recovery links, and is never a sender.

-- The recovery email lives on the profile (the login email stays on the auth user).
alter table public.profiles add column if not exists recovery_email text;

-- An invitation now carries the new login (email = the company email), who it is for, and where it was sent.
alter table public.workspace_invites
  add column if not exists contact_email text not null default '',
  add column if not exists full_name text not null default '';

-- Invitations written for the old flow used the invited person's own email as the login. They can't be
-- accepted any more: owners create new ones.
update public.workspace_invites set status = 'revoked' where status = 'pending';

-- Invited people join the organization that invited them. They must not also get a personal workspace
-- of their own, which is what happens to someone who registers by themselves.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  s public.platform_settings;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);

  if coalesce(new.raw_user_meta_data ->> 'invited', '') = 'true' then
    return new;
  end if;

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
