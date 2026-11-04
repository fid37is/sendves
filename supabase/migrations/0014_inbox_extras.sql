-- Sendves phase 8e: stars, importance, emoji reactions, and Cc / Bcc. Run AFTER 0013_inbox_folders.sql.
--   · stars are per person (like read state): your star is not a colleague's star
--   · importance (low / normal / high) travels with an email as its Importance and X-Priority headers
--   · reactions are internal: they are seen by the team in the thread and are never sent to the contact
--   · Cc and Bcc are kept on the message and on drafts, so a scheduled email still carries them
-- Security model is unchanged: no policies on purpose. Only the server (service role) reads or writes these tables.

-- ── Stars ─────────────────────────────────────────────────────────────────────
create table if not exists public.conversation_stars (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_stars_user_idx on public.conversation_stars (user_id, created_at desc);
alter table public.conversation_stars enable row level security;
-- No policies: only the server reads or writes it.

-- ── Importance ────────────────────────────────────────────────────────────────
-- On a conversation it is the importance of the latest email we sent in it, for the marker in the list.
alter table public.conversations add column if not exists importance text not null default 'normal' check (importance in ('low', 'normal', 'high'));
alter table public.inbox_messages add column if not exists importance text not null default 'normal' check (importance in ('low', 'normal', 'high'));
alter table public.inbox_drafts add column if not exists importance text not null default 'normal' check (importance in ('low', 'normal', 'high'));

-- ── Cc and Bcc ────────────────────────────────────────────────────────────────
alter table public.inbox_messages add column if not exists cc_emails text[] not null default '{}' check (cardinality(cc_emails) <= 10);
alter table public.inbox_messages add column if not exists bcc_emails text[] not null default '{}' check (cardinality(bcc_emails) <= 10);
alter table public.inbox_drafts add column if not exists cc_emails text[] not null default '{}' check (cardinality(cc_emails) <= 10);
alter table public.inbox_drafts add column if not exists bcc_emails text[] not null default '{}' check (cardinality(bcc_emails) <= 10);

-- ── Emoji reactions ───────────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions (message_id, created_at);
alter table public.message_reactions enable row level security;
-- No policies: only the server reads or writes it.
