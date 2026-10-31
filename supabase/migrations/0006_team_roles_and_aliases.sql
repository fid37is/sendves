-- Sendves phase 6: campaign roles and per-person sending emails.
-- Run AFTER 0005_organizations_senders_audience.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- 1. Roles become: owner (the administrator), marketing, sales, operations.
--    Existing admin / manager / member rows become marketing. The owner can change anyone's role afterwards.
-- 2. Sender identities now belong to a person:
--      kind = 'primary' : the person's work email on a verified company domain (jon@domain.com).
--      kind = 'alias'   : an extra address for the same person on the same domain (sales@, jon_sales@).
--    A personal email (Gmail, Yahoo...) is never a sender. See 0007: it only receives the invitation and
--    password-recovery links; people sign in with the company email.

-- ── Roles ─────────────────────────────────────────────────────────────────────
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
update public.workspace_members set role = 'marketing' where role in ('admin', 'manager', 'member');
alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('owner', 'marketing', 'sales', 'operations'));

alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
update public.workspace_invites set role = 'marketing' where role in ('admin', 'manager', 'member');
alter table public.workspace_invites
  add constraint workspace_invites_role_check check (role in ('marketing', 'sales', 'operations'));

-- Saved permission overrides were written for the old roles: back to the defaults.
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
delete from public.role_permissions;
alter table public.role_permissions
  add constraint role_permissions_role_check check (role in ('marketing', 'sales', 'operations'));

-- ── Sender identities belong to a person ──────────────────────────────────────
alter table public.sender_identities
  add column if not exists user_id uuid,
  add column if not exists kind text not null default 'alias';
alter table public.sender_identities drop constraint if exists sender_identities_kind_check;
alter table public.sender_identities add constraint sender_identities_kind_check check (kind in ('primary', 'alias'));

-- Existing identities go to the organization owner, as aliases. The owner can then give themselves a
-- work email and everything keeps working: campaigns already point at these rows.
update public.sender_identities si set user_id = w.owner_id
from public.workspaces w
where si.workspace_id = w.id and si.user_id is null
  and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = w.owner_id);

-- Identities are no longer scoped by department.
update public.sender_identities set department_id = null where department_id is not null;

-- Removing someone from the organization removes their addresses (the app refuses first if a
-- scheduled or sending campaign still uses one).
alter table public.sender_identities drop constraint if exists sender_identities_member_fkey;
alter table public.sender_identities
  add constraint sender_identities_member_fkey foreign key (workspace_id, user_id)
  references public.workspace_members (workspace_id, user_id) on delete cascade;

create unique index if not exists sender_identities_one_primary_idx
  on public.sender_identities (workspace_id, user_id) where kind = 'primary';
create index if not exists sender_identities_user_idx on public.sender_identities (workspace_id, user_id);

-- The address must be local_part@<its domain>, and an alias must sit on the same domain as the
-- person's work email.
create or replace function public.check_sender_identity() returns trigger language plpgsql as $$
declare primary_domain uuid;
begin
  if not exists (
    select 1 from public.sending_domains d
    where d.id = new.domain_id and d.workspace_id = new.workspace_id and new.email = new.local_part || '@' || d.domain
  ) then
    raise exception 'sender identity address does not match its domain';
  end if;
  if new.kind = 'alias' and new.user_id is not null then
    select domain_id into primary_domain from public.sender_identities
    where workspace_id = new.workspace_id and user_id = new.user_id and kind = 'primary';
    if primary_domain is not null and primary_domain <> new.domain_id then
      raise exception 'an alias must be on the same domain as the person''s work email';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sender_identity_check on public.sender_identities;
create trigger sender_identity_check before insert or update of email, local_part, domain_id, kind on public.sender_identities
  for each row execute function public.check_sender_identity();
