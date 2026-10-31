-- Sendves phase 5: organizations (roles, departments, invitations, configurable permissions),
-- sender identities, multi-source campaign audiences, template variables and domain diagnostics.
-- Run AFTER 0004_templates.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- Security model is unchanged: members get SELECT-only access through RLS and every write goes
-- through server actions that use the service-role key AFTER checking the caller's permissions
-- (see src/lib/access.ts and src/lib/workspace.ts). The constraints and triggers below are a second
-- line of defence so that a bug in application code cannot cross workspace boundaries.

-- ── Roles and membership status ───────────────────────────────────────────────
-- Roles become: owner, admin (Administrator), manager, member. Old editor/viewer rows are mapped
-- to the closest new role.
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
update public.workspace_members set role = 'manager' where role = 'editor';
update public.workspace_members set role = 'member' where role = 'viewer';
alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('owner', 'admin', 'manager', 'member'));

alter table public.workspace_members
  add column if not exists status text not null default 'active',
  add column if not exists invited_by uuid references auth.users (id) on delete set null,
  add column if not exists created_at timestamptz not null default now();
alter table public.workspace_members drop constraint if exists workspace_members_status_check;
alter table public.workspace_members
  add constraint workspace_members_status_check check (status in ('active', 'deactivated'));

-- Exactly one owner per workspace.
create unique index if not exists workspace_one_owner_idx on public.workspace_members (workspace_id) where role = 'owner';

-- A deactivated member no longer passes the membership check used by RLS.
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid() and status = 'active'
  );
$$;

-- ── Departments ───────────────────────────────────────────────────────────────
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index if not exists departments_ws_name_idx on public.departments (workspace_id, lower(name));

-- Both foreign keys carry workspace_id, so a person can only be placed in a department of the
-- same workspace they belong to.
create table if not exists public.department_members (
  department_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  primary key (department_id, user_id),
  foreign key (department_id, workspace_id) references public.departments (id, workspace_id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index if not exists department_members_user_idx on public.department_members (workspace_id, user_id);

-- ── Invitations ───────────────────────────────────────────────────────────────
-- The invitation link carries a signed token (see src/server/team.ts); nothing secret is stored.
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'manager', 'member')),
  department_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create unique index if not exists workspace_invites_pending_idx on public.workspace_invites (workspace_id, email) where status = 'pending';
create index if not exists workspace_invites_email_idx on public.workspace_invites (email) where status = 'pending';

-- ── Configurable permissions ──────────────────────────────────────────────────
-- Per-workspace override of what each role may do. A role with no row uses the defaults in
-- src/lib/access.ts. The owner is not stored: the owner can always do everything.
create table if not exists public.role_permissions (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'member')),
  permissions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, role)
);

-- ── Department scope on resources ─────────────────────────────────────────────
-- NULL = visible to the whole organization (all existing rows). Deleting a department that still
-- owns resources is refused, so private resources can never silently become organization-wide.
alter table public.lists add column if not exists department_id uuid references public.departments (id) on delete restrict;
alter table public.templates add column if not exists department_id uuid references public.departments (id) on delete restrict;
alter table public.campaigns add column if not exists department_id uuid references public.departments (id) on delete restrict;
create index if not exists campaigns_dept_idx on public.campaigns (workspace_id, department_id);
create index if not exists lists_dept_idx on public.lists (workspace_id, department_id);
create index if not exists templates_dept_idx on public.templates (workspace_id, department_id);

-- ── Sender identities ─────────────────────────────────────────────────────────
-- A sender identity is an address Sendves is allowed to send AS. It is not a mailbox: Sendves does
-- not receive mail sent to it.
alter table public.sending_domains drop constraint if exists sending_domains_id_ws_key;
alter table public.sending_domains add constraint sending_domains_id_ws_key unique (id, workspace_id);

create table if not exists public.sender_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  domain_id uuid not null,
  local_part text not null check (local_part ~ '^[a-z0-9._+-]{1,64}$'),
  email text not null check (email = lower(email)),
  from_name text not null check (char_length(from_name) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'inactive')),
  department_id uuid references public.departments (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email),
  foreign key (domain_id, workspace_id) references public.sending_domains (id, workspace_id) on delete cascade
);
create index if not exists sender_identities_ws_idx on public.sender_identities (workspace_id, status);

-- The address must be exactly local_part@<the domain row>, whatever the application sends.
create or replace function public.check_sender_identity() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.sending_domains d
    where d.id = new.domain_id and d.workspace_id = new.workspace_id and new.email = new.local_part || '@' || d.domain
  ) then
    raise exception 'sender identity address does not match its domain';
  end if;
  return new;
end $$;
drop trigger if exists sender_identity_check on public.sender_identities;
create trigger sender_identity_check before insert or update of email, local_part, domain_id on public.sender_identities
  for each row execute function public.check_sender_identity();

-- ── Campaign additions ────────────────────────────────────────────────────────
alter table public.campaigns
  add column if not exists sender_identity_id uuid references public.sender_identities (id) on delete set null,
  add column if not exists audience_mode text not null default 'all',
  add column if not exists variables jsonb not null default '[]'::jsonb,
  add column if not exists pause_reason text;
alter table public.campaigns drop constraint if exists campaigns_audience_mode_check;
alter table public.campaigns add constraint campaigns_audience_mode_check check (audience_mode in ('all', 'custom'));

-- Audience: any mix of whole lists and individually chosen contacts. A contact reached more than
-- once (two lists, or a list plus a manual pick) is still one recipient: see enqueue_campaign.
create table if not exists public.campaign_audience_lists (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  primary key (campaign_id, list_id)
);
create index if not exists campaign_audience_lists_list_idx on public.campaign_audience_lists (list_id);

create table if not exists public.campaign_audience_contacts (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  primary key (campaign_id, contact_id)
);
create index if not exists campaign_audience_contacts_contact_idx on public.campaign_audience_contacts (contact_id);

create or replace function public.check_audience_workspace() returns trigger language plpgsql as $$
declare cws uuid; xws uuid;
begin
  select workspace_id into cws from public.campaigns where id = new.campaign_id;
  if tg_table_name = 'campaign_audience_lists' then
    select workspace_id into xws from public.lists where id = new.list_id;
  else
    select workspace_id into xws from public.contacts where id = new.contact_id;
  end if;
  if cws is null or xws is distinct from cws then
    raise exception 'audience member belongs to a different workspace';
  end if;
  return new;
end $$;
drop trigger if exists audience_lists_check on public.campaign_audience_lists;
create trigger audience_lists_check before insert on public.campaign_audience_lists for each row execute function public.check_audience_workspace();
drop trigger if exists audience_contacts_check on public.campaign_audience_contacts;
create trigger audience_contacts_check before insert on public.campaign_audience_contacts for each row execute function public.check_audience_workspace();

-- campaigns.list_id is superseded by campaign_audience_lists. It is kept (unused) so nothing breaks
-- if you roll back; carry existing audiences over.
update public.campaigns set audience_mode = 'custom' where list_id is not null and audience_mode = 'all';
insert into public.campaign_audience_lists (campaign_id, list_id)
select id, list_id from public.campaigns where list_id is not null
on conflict do nothing;

-- Existing From addresses become sender identities (only where the workspace owns the domain).
insert into public.sender_identities (workspace_id, domain_id, local_part, email, from_name)
select distinct on (c.workspace_id, lower(c.from_email))
  c.workspace_id, d.id, split_part(lower(c.from_email), '@', 1), lower(c.from_email),
  left(coalesce(nullif(trim(c.from_name), ''), w.name), 80)
from public.campaigns c
join public.sending_domains d on d.workspace_id = c.workspace_id and d.domain = lower(split_part(c.from_email, '@', 2))
join public.workspaces w on w.id = c.workspace_id
where c.from_email <> '' and split_part(lower(c.from_email), '@', 1) ~ '^[a-z0-9._+-]{1,64}$'
order by c.workspace_id, lower(c.from_email), c.created_at desc
on conflict do nothing;

update public.campaigns c set sender_identity_id = si.id
from public.sender_identities si
where si.workspace_id = c.workspace_id and si.email = lower(c.from_email) and c.sender_identity_id is null;

-- ── Template variables ────────────────────────────────────────────────────────
alter table public.templates add column if not exists variables jsonb not null default '[]'::jsonb;

-- ── Domain diagnostics ────────────────────────────────────────────────────────
alter table public.sending_domains
  add column if not exists last_checked_at timestamptz,
  add column if not exists findings jsonb not null default '{}'::jsonb;

-- A domain is only "verified" when DKIM, SPF and DMARC have all passed. Domains verified under the
-- old rule (DKIM only) go back to pending until they are checked again.
update public.sending_domains set status = 'pending', verified_at = null
where status = 'verified' and not (dkim_ok and spf_ok and dmarc_ok);

-- ── Queue + audience functions (service role only) ────────────────────────────
create or replace function public.enqueue_campaign(p_campaign uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.campaigns; n integer;
begin
  select * into c from public.campaigns where id = p_campaign for update;
  if c.id is null or c.status <> 'scheduled' then return 0; end if;

  -- One row per contact: the EXISTS tests cannot produce duplicates, so a person who is on two
  -- selected lists and also picked by hand still gets exactly one email.
  insert into public.sends (campaign_id, workspace_id, contact_id, email)
  select c.id, c.workspace_id, ct.id, ct.email
  from public.contacts ct
  where ct.workspace_id = c.workspace_id
    and ct.status = 'subscribed'
    and (
      c.audience_mode = 'all'
      or exists (select 1 from public.campaign_audience_contacts cc where cc.campaign_id = c.id and cc.contact_id = ct.id)
      or exists (
        select 1 from public.campaign_audience_lists cl
        join public.list_members lm on lm.list_id = cl.list_id
        where cl.campaign_id = c.id and lm.contact_id = ct.id)
    )
    and not exists (
      select 1 from public.suppression_entries se
      where lower(se.email) = lower(ct.email) and (se.workspace_id is null or se.workspace_id = c.workspace_id))
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics n = row_count;

  update public.campaigns set status = 'sending', started_at = now(), recipient_count = n where id = c.id;
  return n;
end $$;

-- How many people a given audience reaches, by the same rules enqueue_campaign uses. Takes the
-- selection as arguments so the editor can show the count before anything is saved.
create or replace function public.campaign_audience_size(p_workspace uuid, p_mode text, p_lists uuid[], p_contacts uuid[])
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::integer
  from public.contacts ct
  where ct.workspace_id = p_workspace
    and ct.status = 'subscribed'
    and (
      p_mode = 'all'
      or ct.id = any (coalesce(p_contacts, '{}'::uuid[]))
      or exists (select 1 from public.list_members lm where lm.contact_id = ct.id and lm.list_id = any (coalesce(p_lists, '{}'::uuid[])))
    )
    and not exists (
      select 1 from public.suppression_entries se
      where lower(se.email) = lower(ct.email) and (se.workspace_id is null or se.workspace_id = p_workspace));
$$;

-- The custom contact fields in use in a workspace (columns of imported CSV files), sampled so it
-- stays cheap on large accounts.
create or replace function public.contact_field_keys(p_workspace uuid)
returns text[] language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
  from (
    select distinct k from (
      select jsonb_object_keys(custom_fields) as k
      from (select custom_fields from public.contacts where workspace_id = p_workspace and custom_fields <> '{}'::jsonb limit 5000) s
    ) keys
    limit 50
  ) d;
$$;

revoke execute on function public.enqueue_campaign(uuid) from public, anon, authenticated;
revoke execute on function public.campaign_audience_size(uuid, text, uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function public.contact_field_keys(uuid) from public, anon, authenticated;
grant execute on function public.campaign_audience_size(uuid, text, uuid[], uuid[]) to service_role;
grant execute on function public.contact_field_keys(uuid) to service_role;

-- ── Row level security: members read their own workspace, nothing else ────────
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.role_permissions enable row level security;
alter table public.sender_identities enable row level security;
alter table public.campaign_audience_lists enable row level security;
alter table public.campaign_audience_contacts enable row level security;

drop policy if exists "Members read departments" on public.departments;
create policy "Members read departments" on public.departments for select using (public.is_workspace_member(workspace_id) or public.is_admin());
drop policy if exists "Members read department members" on public.department_members;
create policy "Members read department members" on public.department_members for select using (public.is_workspace_member(workspace_id) or public.is_admin());
drop policy if exists "Members read role permissions" on public.role_permissions;
create policy "Members read role permissions" on public.role_permissions for select using (public.is_workspace_member(workspace_id) or public.is_admin());
drop policy if exists "Members read sender identities" on public.sender_identities;
create policy "Members read sender identities" on public.sender_identities for select using (public.is_workspace_member(workspace_id) or public.is_admin());
drop policy if exists "Members read campaign audience lists" on public.campaign_audience_lists;
create policy "Members read campaign audience lists" on public.campaign_audience_lists for select using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and (public.is_workspace_member(c.workspace_id) or public.is_admin())));
drop policy if exists "Members read campaign audience contacts" on public.campaign_audience_contacts;
create policy "Members read campaign audience contacts" on public.campaign_audience_contacts for select using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and (public.is_workspace_member(c.workspace_id) or public.is_admin())));
-- workspace_invites has no policy on purpose: only the server (service role) reads or writes it.
