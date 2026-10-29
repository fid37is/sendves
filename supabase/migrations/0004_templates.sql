-- Sendves: user-created email templates.
-- Run AFTER 0003_analytics_and_hardening.sql, in the Supabase SQL editor (or `supabase db push`).
-- Same model as the other tables: members can read their workspace's templates; every write goes
-- through server actions that use the service-role key after checking workspace membership.

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  subject text not null default '',
  preview_text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_ws_idx on public.templates (workspace_id, updated_at desc);

alter table public.templates enable row level security;
drop policy if exists "Members read templates" on public.templates;
create policy "Members read templates" on public.templates for select using (public.is_workspace_member(workspace_id) or public.is_admin());
