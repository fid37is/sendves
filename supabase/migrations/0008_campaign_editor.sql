-- Sendves: the new campaign editor.
-- Run AFTER 0007_invited_accounts.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- 1. campaigns.design   what the editor edits (layout, content, brand colour, banner, conditions).
--                       `blocks` is left alone: campaigns saved by the old editor still open, and
--                       are turned into a custom layout the first time they are opened.
-- 2. workspaces.email_logo_*   the logo is ONE shared asset per workspace, reused by every campaign.
-- 3. the public `email-assets` bucket   where logos and banners are stored. Files are written only
--                       by the server (service role) under <workspace id>/, after permission checks.

alter table public.campaigns
  add column if not exists design jsonb;

alter table public.workspaces
  add column if not exists email_logo_url text,
  add column if not exists email_logo_align text not null default 'left',
  add column if not exists email_logo_size text not null default 'm',
  add column if not exists email_logo_w integer not null default 0,
  add column if not exists email_logo_h integer not null default 0;

alter table public.workspaces drop constraint if exists workspaces_email_logo_align_check;
alter table public.workspaces add constraint workspaces_email_logo_align_check check (email_logo_align in ('left', 'center', 'right'));
alter table public.workspaces drop constraint if exists workspaces_email_logo_size_check;
alter table public.workspaces add constraint workspaces_email_logo_size_check check (email_logo_size in ('s', 'm', 'l'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
