# Sendves inbox and file checks: what to do with these files

This zip holds ONLY the files that are new or changed. Unzip it into your project root, keeping the folders.
It overwrites the files that already exist at the same path (they are the ones listed as "changed" below).
It contains no `node_modules`, no `.env`, and does not touch `package.json`, `next.config.mjs` or `.env.example`:
make those three small edits yourself.

## 1. package.json: add these, then run `npm install`

dependencies:
    "@aws-sdk/client-s3": "^3.600.0",
    "mailparser": "^3.7.1",
    "nodemailer": "^6.9.14"

devDependencies:
    "@types/mailparser": "^3.4.5",
    "@types/nodemailer": "^6.4.15"

## 2. next.config.mjs: inside `nextConfig`, add

    experimental: { serverActions: { bodySizeLimit: "10mb" } },

## 3. .env.local: add (leave INBOUND_DOMAIN empty to keep the old behaviour of no Reply-To)

    INBOUND_DOMAIN=reply.yourdomain.com
    INBOUND_WEBHOOK_SECRET=a-long-random-string
    INBOUND_SNS_TOPIC_ARN=
    INBOUND_S3_BUCKET=
    # Needed for "a contact replied" emails to people (you probably have it already)
    PLATFORM_FROM_EMAIL=

## 4. Database: run in the Supabase SQL editor, in this order

    supabase/migrations/0011_inbox.sql
    supabase/migrations/0012_inbox_more.sql

Deploy the code and 0012 together (0012 replaces the shared unread flag with per-person read state).

## 5. Receiving mail (Amazon SES): follow docs/inbox.md

## 6. Tests

    npm test          (new: tests/inbox.test.ts, tests/file-check.test.ts)

## Files that replace existing ones (changed)

- src/app/(dashboard)/app/contacts/page.tsx
- src/app/(dashboard)/app/layout.tsx
- src/app/(dashboard)/app/settings/actions.ts
- src/app/(dashboard)/app/settings/page.tsx
- src/app/(public-tools)/u/[token]/actions.ts
- src/app/(public-tools)/u/[token]/page.tsx
- src/app/api/unsubscribe/route.ts
- src/app/api/webhooks/ses/route.ts
- src/components/dashboard/contacts-table.tsx
- src/components/layout/app-shell.tsx
- src/lib/access.ts
- src/lib/env.server.ts
- src/server/compliance/index.ts
- src/server/sending/process.ts
- src/server/sending/providers/console.ts
- src/server/sending/providers/ses/index.ts
- src/server/sending/providers/types.ts
- src/server/sending/render.ts

If you changed any of these after sending me the project, compare before overwriting.

## New files

- docs/inbox.md
- src/app/(dashboard)/app/inbox/actions.ts
- src/app/(dashboard)/app/inbox/page.tsx
- src/app/api/inbox/attachments/route.ts
- src/app/api/webhooks/inbound/route.ts
- src/components/inbox/attach-field.tsx
- src/components/inbox/compose-drawer.tsx
- src/components/inbox/mark-read.tsx
- src/components/inbox/message-card.tsx
- src/components/inbox/reply-box.tsx
- src/components/inbox/saved-replies.tsx
- src/components/inbox/thread-controls.tsx
- src/lib/file-check.ts
- src/lib/inbox-format.ts
- src/lib/inbox-queries.ts
- src/lib/inbox.ts
- src/server/inbox/address.ts
- src/server/inbox/attachments.ts
- src/server/inbox/inbound.ts
- src/server/inbox/notify.ts
- src/server/inbox/outbound.ts
- src/server/inbox/storage.ts
- src/server/inbox/text.ts
- supabase/migrations/0011_inbox.sql
- supabase/migrations/0012_inbox_more.sql
- tests/file-check.test.ts
- tests/inbox.test.ts
