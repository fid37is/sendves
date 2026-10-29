# Sendves phase 2: make it work

This overlay turns the static scaffold into a working product: real contacts, domains, campaigns,
a sending engine, tracking, unsubscribe, bounce handling, reports, admin review and billing.

It is built to be **unzipped over your existing project root** (the folder that contains `package.json`
and `src/`). Allow it to overwrite files when asked.

> Important: I could not run `npm install`, a build or a live SES test where this was written. The code was
> syntax-checked only. Expect to fix a small type or runtime issue or two on first run, and test in
> **console mode** first (below) before sending real email.

## 1. Place the files

Unzip into the project root. Then you have:

**New files (37)**

- `src/app/(admin)/admin/actions.ts`
- `src/app/(admin)/admin/review/[id]/page.tsx`
- `src/app/(dashboard)/app/billing/actions.ts`
- `src/app/(dashboard)/app/campaigns/actions.ts`
- `src/app/(dashboard)/app/contacts/actions.ts`
- `src/app/(dashboard)/app/contacts/import/page.tsx`
- `src/app/(dashboard)/app/domains/actions.ts`
- `src/app/(dashboard)/app/lists/page.tsx`
- `src/app/(dashboard)/app/settings/actions.ts`
- `src/app/(public-tools)/subscribe/[listId]/actions.ts`
- `src/app/(public-tools)/subscribe/[listId]/page.tsx`
- `src/app/(public-tools)/u/[token]/actions.ts`
- `src/app/(public-tools)/u/[token]/page.tsx`
- `src/app/api/contacts/export/route.ts`
- `src/app/api/cron/tick/route.ts`
- `src/app/api/unsubscribe/route.ts`
- `src/app/api/webhooks/paystack/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/components/dashboard/campaign-editor.tsx`
- `src/components/ui/flash.tsx`
- `src/config/plan-limits.ts`
- `src/config/starter-templates.ts`
- `src/lib/email/blocks.ts`
- `src/lib/email/sanitize.ts`
- `src/lib/flash.ts`
- `src/lib/queries.ts`
- `src/lib/tokens.ts`
- `src/lib/validation/email.ts`
- `src/lib/workspace.ts`
- `src/server/sending/domains.ts`
- `src/server/sending/process.ts`
- `src/server/sending/providers/console.ts`
- `src/server/sending/providers/index.ts`
- `src/server/sending/providers/types.ts`
- `src/server/sending/render.ts`
- `src/server/workers/run.ts`
- `supabase/migrations/0002_core.sql`

**Files this overlay replaces (29)**. If you edited any of these yourself, merge instead of overwriting:

- `.env.example`
- `src/app/(admin)/admin/abuse/page.tsx`
- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/review/page.tsx`
- `src/app/(admin)/admin/settings/page.tsx`
- `src/app/(admin)/admin/suppression/page.tsx`
- `src/app/(admin)/admin/users/page.tsx`
- `src/app/(admin)/admin/workspaces/page.tsx`
- `src/app/(dashboard)/app/billing/page.tsx`
- `src/app/(dashboard)/app/campaigns/[id]/page.tsx`
- `src/app/(dashboard)/app/campaigns/new/page.tsx`
- `src/app/(dashboard)/app/campaigns/page.tsx`
- `src/app/(dashboard)/app/contacts/page.tsx`
- `src/app/(dashboard)/app/domains/page.tsx`
- `src/app/(dashboard)/app/layout.tsx`
- `src/app/(dashboard)/app/page.tsx`
- `src/app/(dashboard)/app/reports/page.tsx`
- `src/app/(dashboard)/app/settings/page.tsx`
- `src/app/(dashboard)/app/templates/page.tsx`
- `src/app/api/track/click/route.ts`
- `src/app/api/track/open/route.ts`
- `src/app/api/webhooks/ses/route.ts`
- `src/lib/env.server.ts`
- `src/lib/supabase/admin.ts`
- `src/server/abuse/index.ts`
- `src/server/billing/index.ts`
- `src/server/compliance/index.ts`
- `src/server/imports/index.ts`
- `src/server/sending/providers/ses/index.ts`

## 2. Install packages and edit two project files

```bash
npm install @aws-sdk/client-sesv2 csv-parse
npm install -D tsx
npm pkg set scripts.worker="tsx --env-file=.env.local src/server/workers/run.ts"
```

Node 20.6 or newer is required for the worker (`--env-file`).

In `next.config.mjs`, allow CSV uploads through server actions by adding `experimental`:

```js
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};
```

(I left `package.json` and `next.config.mjs` out of the zip so I don't overwrite changes you've made.)

## 3. Database

1. Run `supabase/migrations/0002_core.sql` in the Supabase SQL editor (after `0001_init.sql`).
2. It creates the tables, the queue functions, the reporting views, the platform settings row and a
   trigger so **every new user gets a workspace**. Users who registered before this get one automatically.
3. Security model: members can only read their own data through RLS. All writes go through server actions
   using the service-role key, so users cannot change protected fields such as plan or review status.

## 4. Environment variables

Copy the new variables from `.env.example` into `.env.local`. The ones you must set now:

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Required. All writes and the worker use it |
| `APP_SECRET` | Required. Signs unsubscribe, open and click links. Generate with `openssl rand -hex 32` |
| `SENDING_PROVIDER` | `console` (prints emails to the terminal) until SES is approved, then `ses` |
| `NEXT_PUBLIC_DEMO_MODE` / `NEXT_PUBLIC_SAMPLE_DATA` | Set both to `false` to see real data |

Do not change `APP_SECRET` after sending: links in emails already sent would stop working.

## 5. Test the whole flow in console mode (no SES needed)

1. `npm run dev` in one terminal and `npm run worker` in another.
2. Register, then open **Settings** and add a business name and address.
3. **Sending domains**: add a domain you own (for example `yourdomain.com`). In console mode it verifies when you select Check records.
4. **Contacts → Import CSV**: upload a file with an `email` column (and optional `first_name`, `last_name`).
5. **Campaigns → New campaign**: build content, pick the domain in the From address, select **Send test to me**.
6. Select **Send campaign**. Because new workspaces are in review, it goes to the admin queue.
7. Sign in as an admin (`update public.profiles set role = 'admin' where email = 'you@example.com';`), open **Admin → Campaign review** and approve it.
8. Watch the worker terminal print each email. Open the campaign page for stats. Copy a link from the printed HTML to test click tracking and the unsubscribe page.

## 6. Go live with Amazon SES

1. Request **SES production access** in your chosen AWS region (start this early; it can take days). While in the sandbox you can send only to verified addresses.
2. Create an IAM user with `ses:SendEmail`, `ses:CreateEmailIdentity`, `ses:GetEmailIdentity`, `ses:DeleteEmailIdentity`. Put its keys and the region in `.env.local`.
3. In SES, create a **configuration set** with an **SNS event destination** for Delivery, Bounce and Complaint events. Put its name in `SES_CONFIGURATION_SET`.
4. Subscribe the SNS topic (HTTPS) to `https://YOUR-DOMAIN/api/webhooks/ses?secret=YOUR_SES_WEBHOOK_SECRET`. The endpoint confirms the subscription automatically.
5. Set `SENDING_PROVIDER=ses`. Add a real domain; Sendves registers it with SES and shows the DKIM CNAME records to create.
6. Raise `SEND_RATE_PER_SECOND` to match your SES limit (sandbox is 1 per second).

## 7. Hosting the worker

The sending engine must run continuously. Two options:

- **A VPS (recommended to start):** run `npm run build && npm start` and `npm run worker` under a process manager such as pm2 or systemd.
- **Serverless (Vercel and similar):** run the app there and call `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET` (for example from Vercel Cron). Each call does up to about 50 seconds of sending.

Open and click links, unsubscribe pages and webhooks need `NEXT_PUBLIC_SITE_URL` to be your real public URL.

## 8. Billing

Both providers are optional; the Billing page shows only the ones you configure.

- **Stripe:** set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, and add a webhook to `/api/webhooks/stripe` for `checkout.session.completed` and `customer.subscription.deleted` (put its secret in `STRIPE_WEBHOOK_SECRET`).
- **Paystack:** set `PAYSTACK_SECRET_KEY` and `PAYSTACK_AMOUNT_STARTER/GROWTH` (in kobo), optionally the plan codes, and set the Paystack webhook URL to `/api/webhooks/paystack`.
- Test in each provider's test mode first. The Paystack cancellation handling matches the customer by account email and should be verified against a real test event.
- Prices shown to customers still come from `src/config/plans.ts` (placeholders). Make the provider amounts match.

## 9. What is now real

- Workspace created at sign-up; Settings saves profile and workspace (business address required for sending)
- CSV import with consent confirmation, validation, de-duplication, disposable-address blocking, plan limits, lists; manual add; CSV export
- Sending domains registered with SES, DKIM records shown, verification, SPF and DMARC checks
- Block-based email editor with live preview, templates, test send, send now or schedule, pre-send checklist
- Delivery engine: queued per-recipient sends, throttling, retries with backoff, daily limits, monthly plan limits, pause, resume and cancel
- Tracking: signed click redirects and open pixel; one-click unsubscribe headers and a public unsubscribe page; hosted signup page per list
- SES events: deliveries, hard bounces and complaints update contacts and the global suppression list
- Reports from real events; per-link clicks
- Protection: first-campaign review, automatic pause on high bounce or complaint rates, automatic suspension, warm-up that raises daily limits after healthy campaigns, admin approve, reject, suspend and reinstate, editable thresholds
- The sample-data switch still works: with `NEXT_PUBLIC_SAMPLE_DATA=true` the dashboard and admin show fake data

## 10. Known gaps to handle before a public launch

- SES webhook uses a shared secret in the URL. Add SNS signature verification as a hardening step.
- No rate limit on the public signup form, test emails or login yet (honeypot only). Add rate limiting before launch.
- Signup form is single opt-in. Double opt-in (confirmation email) is not built yet.
- Not built yet: A/B subject tests, segments, saving custom templates, team seats, audit log, automations.
- Plan prices are still placeholders, and legal pages are still drafts for a lawyer to review.
- Open tracking is unreliable by nature; clicks are the metric to trust.
