-- Sendves phase 16: several businesses under one account.
-- Run AFTER 0015, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
--
-- A business is a workspace: it keeps its own logo, address, domains, contacts, unsubscribes and senders.
-- The first workspace a person owns is their main business and carries the subscription. Every business added
-- later points at it here, uses the plan's per-business limits, and counts toward the plan's business cap.
-- Deleting the main business deletes the businesses added under it.

alter table public.workspaces
  add column if not exists account_workspace_id uuid references public.workspaces (id) on delete cascade;

create index if not exists workspaces_account_idx on public.workspaces (account_workspace_id) where account_workspace_id is not null;
