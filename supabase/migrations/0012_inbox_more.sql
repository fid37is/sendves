-- Sendves phase 8b: the rest of the inbox. Run AFTER 0011_inbox.sql.
--   · read state per person (it was one flag shared by everyone)
--   · attachments, stored privately
--   · saved replies
--   · an email to the person a reply is for
--   · a reply that asks to unsubscribe is recorded as such

-- ── Read state per person ─────────────────────────────────────────────────────
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;
-- No policies: only the server reads or writes it.

-- The shared flag is replaced by the table above.
drop index if exists public.conversations_unread_idx;
alter table public.conversations drop column if exists unread;

-- Conversations a person still has to look at: open, the contact spoke last, and they haven't opened it since.
-- p_all = they may see every conversation; otherwise only the ones they own or that are assigned to them.
create or replace function public.inbox_unread(p_workspace uuid, p_user uuid, p_all boolean)
returns setof uuid
language sql
stable
as $$
  select c.id
  from public.conversations c
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = p_user
  where c.workspace_id = p_workspace
    and c.status = 'open'
    and c.last_direction = 'inbound'
    and c.last_inbound_at is not null
    and (r.last_read_at is null or r.last_read_at < c.last_inbound_at)
    and (p_all or c.owner_id = p_user or c.assigned_to = p_user);
$$;
revoke all on function public.inbox_unread(uuid, uuid, boolean) from public, anon, authenticated;

-- ── Notification emails ───────────────────────────────────────────────────────
-- When the last "new reply" email for a conversation went out, so a burst of replies is one email, not twenty.
alter table public.conversations add column if not exists notified_at timestamptz;
alter table public.profiles add column if not exists notify_inbox_replies boolean not null default true;

-- ── Replies that ask to unsubscribe ───────────────────────────────────────────
alter table public.inbox_messages add column if not exists unsubscribe_requested boolean not null default false;

-- ── Attachments ───────────────────────────────────────────────────────────────
-- Files are kept in a private bucket and opened only through the app, which checks who may see the conversation.
-- inbox_messages.attachments holds one entry per file: { id, name, size, type, path, blocked }.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('inbox-attachments', 'inbox-attachments', false, 10485760)
    on conflict (id) do update set public = false, file_size_limit = 10485760;
  end if;
end $$;

-- ── Saved replies ─────────────────────────────────────────────────────────────
create table if not exists public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_replies_workspace_idx on public.saved_replies (workspace_id, title);
alter table public.saved_replies enable row level security;
-- No policies: only the server reads or writes it.
