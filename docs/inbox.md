# Inbox: replies and one-to-one email

## What it does

- **Replies to campaigns.** When a contact answers a campaign email, the reply appears in **Inbox** (sidebar), in one conversation per email.
- **Replying.** Answer from the thread. The reply goes out from the address the contact wrote to, and is threaded in their mail program.
- **Single emails.** **New email** (Inbox, or the envelope icon on a subscribed contact) writes to one contact. Their answer comes back to the same thread.
- **Attachments, saved replies, notification emails.** See "Also included" below.
- **Closing and assigning.** Conversations can be closed (a new reply reopens them) and, for people who can see everyone's, assigned to a colleague.
- **Reports.** A person answering a campaign email is recorded once as a `reply` event.

## Who sees what

| Permission | Lets someone |
| --- | --- |
| `inbox.view` | Read conversations on their **own** sender addresses and ones assigned to them |
| `inbox.reply` | Reply, close, and start new emails (also needs `contacts.view` to start one) |
| `inbox.all` | See every conversation in the organization, and assign them |

Owners and the default roles get `inbox.view` and `inbox.reply`; owners also get `inbox.all`. The rule is applied in the query, not only in the page.
Organizations that already saved their own role permissions need to tick the new Inbox permissions once under Team.

## How replies arrive (and why)

Every email Sendves sends carries a `Reply-To` like `s…@reply.yourdomain.com`, on a domain **you** own. The customer's own domain and MX records are never touched, so their Google Workspace or Microsoft mailboxes keep working. The part before the `@` is signed, so only addresses Sendves made are accepted.

If `INBOUND_DOMAIN` is empty, emails go out with no `Reply-To` and replies land wherever they did before. Nothing else changes.

## Setup (Amazon SES)

SES can receive mail in a limited set of regions: check that yours supports it, or receive in a supported region.

1. Pick a domain you control, e.g. `reply.yourdomain.com`. Set `INBOUND_DOMAIN` to it.
2. **Verify** the domain as an SES identity (Verified identities).
3. Add DNS: `MX  reply.yourdomain.com  10  inbound-smtp.<region>.amazonaws.com`.
4. Create an **S3 bucket** for received mail. Add a lifecycle rule that expires objects after about 30 days. Set `INBOUND_S3_BUCKET` to its name. Mail is only ever read from this bucket.
5. Create an **SNS topic** (e.g. `sendves-inbound`). Optionally set `INBOUND_SNS_TOPIC_ARN`.
6. In SES, create a **receipt rule set** (and make it active) with a rule for `reply.yourdomain.com` that has the actions: **S3** (your bucket) and then **SNS** (your topic), spam and virus scanning on.
7. Subscribe `https://YOUR-APP/api/webhooks/inbound?secret=INBOUND_WEBHOOK_SECRET` to the SNS topic (HTTPS). It confirms itself.
8. Give the app's AWS user: `s3:GetObject` on the bucket.
9. Run migration `supabase/migrations/0011_inbox.sql`, then `npm install` (adds `mailparser` and `@aws-sdk/client-s3`).

## Trying it without any mail setup

With `SENDING_PROVIDER=console` and `INBOUND_DOMAIN` set to anything (e.g. `reply.localhost`), open a conversation and use **Simulate reply**. It runs a real message through the same receiving code SES uses.

## Rules that protect your sending reputation

- Single emails count against the **same daily limit** as campaigns.
- The sender must be active, on a domain that passes DKIM, SPF and DMARC, and your own address (or alias).
- Hard-bounced, complained and suppressed addresses are never emailed. Bounces and complaints from single emails suppress the address everywhere, like campaign ones.
- You can **answer** someone who unsubscribed from campaigns when they wrote to you, but you can only **start** an email to a subscribed contact.
- The first email to someone carries your business address and an unsubscribe link (works like a campaign's). Replies inside a thread don't.
- Single emails are not tracked (no open pixel, no link rewriting).

## Also included

- **Attachments.** Received files are kept in a private bucket (up to 10 per message, 10 MB each) and opened from the thread through the app, which checks who may see the conversation; they always download, never open in the page. Files that fail the checks below are listed as "not kept". You can attach up to 5 files, 7 MB in all, to a reply or a new email; those are sent as a full MIME message through SES.
- **Saved replies.** Shared by the organization. Insert one from the reply box or New email; `{{first_name}}`, `{{name}}` and `{{my_name}}` are filled in. Anyone who can reply can add one; you change or delete your own, and people with `inbox.all` can change any.
- **Notification emails.** When a contact replies, the person the conversation is assigned to (otherwise the owner of the address) gets an email with a short preview and a link. At most one per conversation every 15 minutes. Needs `PLATFORM_FROM_EMAIL`. Each person can turn it off under Settings, Your account.
- **Replies that say "unsubscribe".** A short reply from the contact's own address that asks to unsubscribe ("unsubscribe", "remove me", "stop emailing me", "STOP") unsubscribes them at once, is added to the suppression list, recorded as an unsubscribe event, and the message shows a notice. A long message that only mentions the word is left for a person to read.
- **Read state per person.** A conversation is unread for you until you open it after the contact's latest message. Opening it clears it for you, not for a colleague. The sidebar count is yours. Once someone answers, it is no longer unread for anyone.
- **Not sent, and bounced.** If the email provider refuses a message it stays in the thread as "Not sent" with **Send again** and **Discard**. A bounced single email has **Send again** too: it goes through the same rules, so it only goes out once the address has been corrected or taken off the suppression list.

Migration `0012_inbox_more.sql` adds all of this (run it after `0011`). It replaces the single shared unread flag with per-person read rows, so deploy the new code and the migration together. `npm install` now also adds `nodemailer`.

## What is still not included

- A bounced address is not fixed for you: correct the contact (or the suppression entry) first.
- Notification emails go to the sign-in email on the profile.
- Sendves has no antivirus of its own (see below). For received mail, turn on SES virus scanning in the receipt rule: infected mail is dropped.

## File checks (`src/lib/file-check.ts`)

Every attachment, sent or received, goes through a free filter. It is **not an antivirus**: it can't recognise malware, only the tricks most malicious attachments use. A file that fails is refused when sending (with the reason shown) and listed as "not kept" when received (hover it for the reason).

- **Real type, not the name:** the first bytes decide. A program renamed `invoice.pdf` is caught; so is a `.pdf`, `.png`, `.jpg`, `.gif`, `.webp`, `.docx`, `.xlsx`, `.doc`, `.zip` or text file that isn't really one.
- **Code that runs when opened:** `.exe`, `.js`, `.bat`, `.vbs`, `.ps1`, `.lnk` and similar; web pages and scripted images (`.html`, `.svg`); macro-enabled Office files (`.docm`, `.xlsm`, `.pptm`), and old `.doc`/`.xls` files that hold a macro project.
- **Disguised names:** right-to-left override characters, trailing spaces or dots.
- **Archives:** only `.zip` is accepted, read from its table of contents without unpacking (so a zip bomb can't hurt). Refused: password-protected zips, zips holding programs, scripts, macros or other archives, damaged zips, and `.rar`, `.7z`, `.tar`, `.gz` and similar.

A disguised malicious PDF can still pass. For real scanning, add ClamAV or a scanning API later; the filter stays useful in front of it.
