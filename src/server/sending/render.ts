import { escapeHtml, personalize } from "@/lib/email/blocks";
import { emailTheme } from "@/config/brand";
import { serverEnv } from "@/lib/env.server";
import { clickSig, openSig, unsubscribeToken } from "@/lib/tokens";
import type { OutboundEmail } from "./providers/types";

type CampaignInput = { id: string; subject: string; from_name: string; from_email: string; html: string };
type WorkspaceInput = { name: string; business_address: string | null; track_opens: boolean };
type ContactInput = { first_name: string | null; last_name: string | null; email: string };

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.replace(/<[^>]+>/g, "")} (${href})`)
    .replace(/<(br|\/p|\/h1|\/tr|\/div)[^>]*>/gi, "\n")
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

  let html = personalize(campaign.html, contact);
  if (sendId) html = rewriteLinks(html, sendId);

  const footer =
    `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${emailTheme.muted};text-align:center;">` +
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
    subject: `${args.subjectPrefix ?? ""}${plain(personalize(campaign.subject, contact))}`,
    html,
    text: htmlToText(html),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: sendId ? { send_id: sendId } : undefined,
  };
}
