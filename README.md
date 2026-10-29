# Sendves

Email that moves with you. A focused email campaign platform (see the PRD for scope).

This is the first scaffold. It covers **landing, public pages, user dashboard, admin console and auth**.
Sending, editor, imports, tracking and billing are stubbed and ready for the next iterations.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (auth + Postgres) · Plus Jakarta Sans · lucide-react

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Two independent switches in `.env.local` control testing behaviour:

| Variable | When `true` | When `false` |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | Sign-in is bypassed, so `/app` and `/admin` open without Supabase (as a demo admin) | Real Supabase sign-in is required |
| `NEXT_PUBLIC_SAMPLE_DATA` | Fake stats, contacts, campaigns, users, testimonials and social proof appear (`src/lib/mock-data.ts`, `src/lib/sample-content.ts`) | Pages show real empty states |

Both default to `true` in `.env.example`. **Set both to `false` to go live.** Pages read data through
`src/lib/data.ts`, so each Supabase table can replace its sample export one at a time.

## Connect Supabase

1. Create a Supabase project and copy the URL, anon key and service role key into `.env.local`.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. In Supabase → Authentication → URL Configuration, set the Site URL to your site URL and add
   `http://localhost:3000/auth/callback` (and your production URL) as a redirect URL.
4. Set `NEXT_PUBLIC_DEMO_MODE=false` and restart.
5. Register an account, then make it an admin:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`

## Auth

- Email and password only. No OAuth.
- Registration uses an existing email address. It signs the user in and is used to recover the account.
- Pages: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`; email links return through `/auth/callback`.
- `middleware.ts` protects `/app` and `/admin`; `/admin` also requires `profiles.role = 'admin'`.

## Structure

```
middleware.ts                 route protection + session refresh
supabase/migrations/          SQL (profiles, workspaces, RLS)
src/
  app/
    (marketing)/              landing, features, pricing, about, contact, help, legal pages
    (auth)/                   login, register, forgot/reset password, verify email, server actions
    (dashboard)/app/          user dashboard (overview, campaigns, contacts, templates, domains, reports, billing, settings)
    (admin)/admin/            admin console (overview, workspaces, users, review, abuse, suppression, plans, settings)
    api/                      health, SES webhook (stub), tracking endpoints (stubs)
    auth/callback/            email link handler
  components/                 ui/, layout/, marketing/, auth/, editor/ (empty)
  config/                     site.ts (nav, footer), plans.ts (placeholder pricing)
  content/legal.ts            draft legal copy
  lib/                        env, supabase clients, session helper, mock data, utils
  server/                     delivery engine folders (queue, workers, sending, tracking, compliance, billing, imports, abuse)
```

## Design tokens

White is `#ffffff` everywhere. Brand blue `#1D4ED8` (with `#3B82F6` accent), navy ink `#0F172A`, mist `#E2E8F0`.
All defined in `tailwind.config.ts`. Font: Plus Jakarta Sans via `next/font/google` (`src/app/layout.tsx`).

## Before launch

- Replace the placeholder prices in `src/config/plans.ts` once pricing is decided.
- Have a lawyer review `src/content/legal.ts`, then set `legalIsDraft: false` in `src/config/site.ts`.
- Set the real support email and business address.
