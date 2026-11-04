-- Sendves phase 8f: more than one To address. Run AFTER 0014_inbox_extras.sql.
-- The first person in To is still the conversation's contact. Anyone else in To is kept here, so the thread shows
-- them, a failed send can be sent again, and a scheduled email still goes to everyone. To, Cc and Bcc share ten.
alter table public.inbox_messages add column if not exists to_emails text[] not null default '{}' check (cardinality(to_emails) <= 10);
alter table public.inbox_drafts add column if not exists to_emails text[] not null default '{}' check (cardinality(to_emails) <= 10);
