-- Sendves phase 8: the campaign designer (templates, blocks, brand, uploaded pictures).
-- Run AFTER 0007_invited_accounts.sql, in the Supabase SQL editor (or `supabase db push`).

-- The design the editor edits (template or custom blocks, brand colour, banner, conditions).
-- `html` stays the rendered email and is what gets sent; `blocks` is no longer written by the editor.
alter table public.campaigns add column if not exists design jsonb;

-- Saved templates can hold a full design too. `blocks` stays so the Templates page keeps working.
alter table public.templates add column if not exists design jsonb;

-- The logo is shared by every campaign of a workspace.
create table if not exists public.workspace_brand (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  logo_url text not null default '',
  logo_align text not null default 'left' check (logo_align in ('left', 'center', 'right')),
  logo_size text not null default 'm' check (logo_size in ('s', 'm', 'l')),
  updated_at timestamptz not null default now()
);
alter table public.workspace_brand enable row level security;
drop policy if exists "Members read brand" on public.workspace_brand;
create policy "Members read brand" on public.workspace_brand for select using (public.is_workspace_member(workspace_id) or public.is_admin());
-- Writes go through server actions (service role) after a permission check.

-- Public bucket for pictures used in emails (logo, banner, images). Email clients must be able to load
-- them without signing in. Uploads happen only through the app, which checks type, size and workspace.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('email-assets', 'email-assets', true, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  end if;
end $$;
