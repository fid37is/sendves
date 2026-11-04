-- Sendves phase 8: the inbox. Replies to campaigns, and single emails sent to one contact.
-- Run AFTER 0010_company_profile.sql, in the Supabase SQL editor (or `supabase db push`).
--
-- How replies arrive: every email Sendves sends carries a Reply-To on Sendves' own inbound domain
-- (INBOUND_DOMAIN, e.g. reply.sendves.com), with a signed token in the address. A customer's own
-- MX records are never touched, so their company mailboxes keep working. See docs/inbox.md.
--
-- Security model is unchanged: no policies on purpose. Only the server (service role) reads or writes
-- these tables, after checking the caller's permissions (src/lib/access.ts) and which conversations
-- they may see (src/lib/inbox.ts).

-- ── Conversations ─────────────────────────────────────────────────────────────
-- One conversation is one back-and-forth with one contact: either started by a reply to a campaign
-- email (kind = 'campaign', one per send) or by a single email someone wrote (kind = 'direct').
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  contact_email text not null check (contact_email = lower(contact_email)),
  contact_name text not null default '',
  subject text not null default '',
  kind text not null default 'direct' check (kind in ('campaign', 'direct')),
  campaign_id uuid references public.campaigns (id) on delete set null,
  send_id uuid references public.sends (id) on delete set null,
  -- The address the contact is writing to / was written from. If it is removed the conversation stays.
  sender_identity_id uuid references public.sender_identities (id) on delete set null,
  -- Whose conversation it is: the person who owns the sender address. Assignment can move it to someone else.
  owner_id uuid references auth.users (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  -- Shared by everyone who can see the conversation: true from a real reply until someone opens it.
  unread boolean not null default false,
  last_direction text not null default 'outbound' check (last_direction in ('inbound', 'outbound')),
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  snippet text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- A campaign email is answered in at most one conversation, however many times the contact replies.
create unique index if not exists conversations_send_idx on public.conversations (send_id) where send_id is not null;
create index if not exists conversations_list_idx on public.conversations (workspace_id, status, last_message_at desc);
create index if not exists conversations_owner_idx on public.conversations (workspace_id, owner_id);
create index if not exists conversations_assigned_idx on public.conversations (workspace_id, assigned_to);
create index if not exists conversations_unread_idx on public.conversations (workspace_id) where unread and status = 'open';
create index if not exists conversations_contact_idx on public.conversations (contact_id);

-- ── Messages ──────────────────────────────────────────────────────────────────
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null default '',
  from_name text not null default '',
  to_email text not null default '',
  subject text not null default '',
  text_body text not null default '' check (char_length(text_body) <= 200000),
  -- Inbound only, exactly as received. It is never put in the page: it is shown in a sandboxed frame that blocks scripts and remote content.
  html_body text check (html_body is null or char_length(html_body) <= 500000),
  -- Outbound: the id the email provider returned (bounces and complaints find the message by it).
  -- Inbound: the provider's id for the received message, so a retried delivery is stored once.
  provider_message_id text,
  rfc_message_id text,
  in_reply_to text,
  sent_by uuid references auth.users (id) on delete set null,
  status text not null default 'sent' check (status in ('sending', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  error text,
  -- Out-of-office and other automatic replies are kept but never count as a person answering.
  auto boolean not null default false,
  -- Flagged by the provider's spam check.
  spam boolean not null default false,
  -- Names and sizes only. Attachments are not stored.
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inbox_messages_thread_idx on public.inbox_messages (conversation_id, created_at);
create index if not exists inbox_messages_provider_idx on public.inbox_messages (provider_message_id) where provider_message_id is not null;
create unique index if not exists inbox_messages_inbound_once_idx on public.inbox_messages (provider_message_id) where direction = 'inbound' and provider_message_id is not null;
-- Counts what a workspace sent today, next to campaign sends, against its daily limit.
create index if not exists inbox_messages_sent_idx on public.inbox_messages (workspace_id, created_at) where direction = 'outbound';

alter table public.conversations enable row level security;
alter table public.inbox_messages enable row level security;
-- No policies: only the server (service role) reads or writes these tables.

-- ── Replies in reports ────────────────────────────────────────────────────────
-- A person answering a campaign email becomes a 'reply' event, next to opens and clicks.
alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('delivered', 'open', 'click', 'bounce', 'complaint', 'unsubscribe', 'reply'));
