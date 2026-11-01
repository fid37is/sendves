import { escapeHtml, personalize } from "@/lib/email/blocks";
import { applyConditions, fillCountdown, UNSUBSCRIBE_TOKEN } from "@/lib/email/campaign";
import { emailTheme } from "@/config/brand";
import { serverEnv } from "@/lib/env.server";
import { clickSig, openSig, unsubscribeToken } from "@/lib/tokens";
import type { VariableDef } from "@/lib/email/variables";
import type { OutboundEmail } from "./providers/types";

type CampaignInput = { id: string; subject: string; from_name: string; from_email: string; html: string; variables?: VariableDef[] };
type WorkspaceInput = { name: string; business_address: string | null; track_opens: boolean; timezone?: string | null };
type ContactInput = { first_name: string | null; last_name: string | null; email: string; custom_fields?: Record<string, unknown> | null };

const UNSUB_SENTINEL = "\u0001";

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.replace(/<[^>]+>/g, "")} (${href})`)
    .replace(/<(br|\/p|\/h[1-6]|\/tr|\/div|\/table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rewriteLinks(html: string, sendId: string): string {
  const base = serverEnv.appUrl;
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    const raw = url.replace(/&amp;/g, "&");
    const u = Buffer.from(raw).toString("base64url");
    return `href="${base}/api/track/click?s=${sendId}&u=${u}&g=${clickSig(sendId, raw)}"`;
  });
}

function plain(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Builds the final email for one recipient: personalisation, click tracking, open pixel,
 * the mandatory unsubscribe footer and the one-click unsubscribe headers.
 * When sendId is null (test emails) tracking and unsubscribe links are inert.
 */
export function buildEmail(args: {
  campaign: CampaignInput;
  workspace: WorkspaceInput;
  contact: ContactInput;
  sendId: string | null;
  subjectPrefix?: string;
}): OutboundEmail {
  const { campaign, workspace, contact, sendId } = args;
  const base = serverEnv.appUrl;
  const unsubUrl = sendId ? `${base}/u/${unsubscribeToken(sendId)}` : `${base}/u/test`;
  const oneClickUrl = sendId ? `${base}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(sendId))}` : unsubUrl;

  const variables = campaign.variables ?? [];
  // Blocks meant for other contacts go first, so nothing about them is tracked or counted.
  let html = fillCountdown(applyConditions(campaign.html, contact), workspace.timezone || "UTC");

  // The editor's footer block carries the unsubscribe link, so only the address is added after it.
  // Campaigns saved before that have no such link in them and keep the complete footer. The link is
  // parked behind a control character while the email is personalised (a contact's own text can't
  // contain one) and put back after click tracking, which must never wrap it.
  const hasUnsubscribeBlock = campaign.html.includes(UNSUBSCRIBE_TOKEN);
  html = personalize(html.split(UNSUBSCRIBE_TOKEN).join(UNSUB_SENTINEL), contact, variables);
  if (sendId) html = rewriteLinks(html, sendId);
  html = html.split(UNSUB_SENTINEL).join(unsubUrl);

  const footer = hasUnsubscribeBlock
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${emailTheme.muted};text-align:center;">${escapeHtml(workspace.business_address ?? "")}</p>`
    : `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${emailTheme.muted};text-align:center;">` +
      `You are receiving this email because you subscribed to ${escapeHtml(workspace.name)}.<br>` +
      `<a href="${unsubUrl}" style="color:${emailTheme.muted};">Unsubscribe</a><br>` +
      `${escapeHtml(workspace.business_address ?? "")}</p>`;
  const pixel =
    sendId && workspace.track_opens
      ? `<img src="${base}/api/track/open?s=${sendId}&g=${openSig(sendId)}" width="1" height="1" alt="" style="display:block;border:0;">`
      : "";

  html = html.includes("<!--FOOTER-->") ? html.replace("<!--FOOTER-->", footer + pixel) : html + footer + pixel;

  const fromName = campaign.from_name.replace(/["<>\r\n]/g, "").trim();
  return {
    from: fromName ? `"${fromName}" <${campaign.from_email}>` : campaign.from_email,
    to: contact.email,
    subject: `${args.subjectPrefix ?? ""}${plain(personalize(campaign.subject, contact, variables))}`,
    html,
    text: htmlToText(html),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: sendId ? { send_id: sendId } : undefined,
  };
}
