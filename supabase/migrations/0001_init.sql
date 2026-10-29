-- Sendves: initial schema (profiles, workspaces, membership) with row level security.
-- Run in the Supabase SQL editor, or with the Supabase CLI: supabase db push

create extension if not exists "pgcrypto";

create type public.app_role as enum ('user', 'admin');

-- Profiles: one row per auth user. The email is stored for display and account recovery.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

-- Helper that avoids recursive RLS when checking for admins.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Admins read all profiles" on public.profiles
  for select using (public.is_admin());

-- Users may edit their profile but never change their own role.
create policy "Users update their own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- Create a profile automatically when someone registers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Workspaces: each customer account works inside one or more workspaces.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'review' check (status in ('active', 'review', 'suspended')),
  business_address text,
  timezone text not null default 'UTC',
  daily_send_limit integer not null default 200,
  max_contacts integer not null default 500,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "Members read their memberships" on public.workspace_members
  for select using (user_id = auth.uid() or public.is_admin());

create policy "Members read their workspaces" on public.workspaces
  for select using (
    exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = auth.uid())
    or public.is_admin()
  );

-- Next migrations (see PRD section 8.5): contacts, lists, templates, campaigns,
-- sends, events, suppression_entries, sending_domains, abuse_cases, audit_log.

-- To make yourself an admin after registering:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
