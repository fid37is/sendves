-- Sendves phase 8c: mail folders for the inbox redesign. Run AFTER 0012_inbox_more.sql.
--   · Bin and Junk on conversations
--   · Drafts and scheduled emails (one table, one row per email that has not been sent yet)
--   · one query for the Unread and Read folders, so they page and search in the database
-- Security model is unchanged: no policies on purpose. Only the server (service role) reads or writes these
-- tables, after checking the caller's permissions (src/lib/access.ts) and which conversations they may see.

-- ── Bin and Junk ──────────────────────────────────────────────────────────────
alter table public.conversations add column if not exists trashed_at timestamptz;
alter table public.conversations add column if not exists is_junk boolean not null default false;
create index if not exists conversations_folder_idx on public.conversations (workspace_id, trashed_at, is_junk, last_message_at desc);

-- Conversations the provider's spam check already flagged, and nobody has answered, start in Junk.
update public.conversations c set is_junk = true
where not c.is_junk
  and exists (select 1 from public.inbox_messages m where m.conversation_id = c.id and m.direction = 'inbound' and m.spam and not m.auto)
  and not exists (select 1 from public.inbox_messages m where m.conversation_id = c.id and m.direction = 'outbound');

-- A new message from the contact: a spam-flagged one puts the conversation in Junk; a real one brings it back from the Bin.
create or replace function public.inbox_message_flags() returns trigger language plpgsql as $$
begin
  if new.direction = 'inbound' and not new.auto then
    if new.spam then
      update public.conversations set is_junk = true where id = new.conversation_id;
    else
      update public.conversations set trashed_at = null where id = new.conversation_id and trashed_at is not null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists inbox_messages_flags on public.inbox_messages;
create trigger inbox_messages_flags after insert on public.inbox_messages for each row execute function public.inbox_message_flags();

-- ── Drafts and scheduled emails ───────────────────────────────────────────────
-- Private to the person who wrote them. status: draft (saved, not sent), scheduled (goes out at scheduled_at),
-- sending (being sent right now), failed (a scheduled email that could not be sent; `error` says why).
-- attachments holds one entry per file, like inbox_messages.attachments: { id, name, size, type, path, blocked }.
create table if not exists public.inbox_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  identity_id uuid references public.sender_identities (id) on delete set null,
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 20000),
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'failed')),
  scheduled_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_drafts_owner_idx on public.inbox_drafts (workspace_id, user_id, status, updated_at desc);
create index if not exists inbox_drafts_due_idx on public.inbox_drafts (scheduled_at) where status in ('scheduled', 'sending');
alter table public.inbox_drafts enable row level security;
-- No policies: only the server reads or writes it.

-- ── Unread now leaves out Junk and the Bin ────────────────────────────────────
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
    and c.trashed_at is null
    and not c.is_junk
    and c.last_direction = 'inbound'
    and c.last_inbound_at is not null
    and (r.last_read_at is null or r.last_read_at < c.last_inbound_at)
    and (p_all or c.owner_id = p_user or c.assigned_to = p_user);
$$;
revoke all on function public.inbox_unread(uuid, uuid, boolean) from public, anon, authenticated;

-- ── One page of the Unread or Read folder ─────────────────────────────────────
-- p_mode is 'unread' or 'read'. Unread is per person, so it cannot be a plain column filter. Returns the ids of
-- one page, newest first, and the total across all pages. The other filters are null when not used.
create or replace function public.inbox_page(
  p_workspace uuid, p_user uuid, p_all boolean, p_mode text,
  p_q text, p_mine boolean, p_kind text, p_status text, p_since timestamptz,
  p_limit int, p_offset int
)
returns table (id uuid, total bigint)
language sql
stable
as $$
  with base as (
    select c.id, c.last_message_at,
      (c.status = 'open' and c.last_direction = 'inbound' and c.last_inbound_at is not null
        and (r.last_read_at is null or r.last_read_at < c.last_inbound_at)) as is_unread
    from public.conversations c
    left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = p_user
    where c.workspace_id = p_workspace
      and c.trashed_at is null
      and not c.is_junk
      and c.last_inbound_at is not null
      and (p_all or c.owner_id = p_user or c.assigned_to = p_user)
      and (not p_mine or c.owner_id = p_user or c.assigned_to = p_user)
      and (p_kind is null or c.kind = p_kind)
      and (p_status is null or c.status = p_status)
      and (p_since is null or c.last_message_at >= p_since)
      and (p_q is null or c.contact_email ilike '%' || p_q || '%' or c.contact_name ilike '%' || p_q || '%' or c.subject ilike '%' || p_q || '%')
  )
  select b.id, count(*) over () as total
  from base b
  where (p_mode = 'unread' and b.is_unread) or (p_mode = 'read' and not b.is_unread)
  order by b.last_message_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.inbox_page(uuid, uuid, boolean, text, text, boolean, text, text, timestamptz, int, int) from public, anon, authenticated;