/**
 * The email exactly as one contact would receive it, for the editor's Preview step and the
 * review dialog. Pure, and built from the same stored html and the same steps as buildEmail on the
 * server (conditions, countdown, variables), so what is previewed is what is sent.
 */
import { emailTheme } from "@/config/brand";
import { escapeHtml, personalize } from "@/lib/email/blocks";
import { applyConditions, darkThemeCss, fillCountdown, renderCampaignHtml, UNSUBSCRIBE_TOKEN, type ContactLike, type Design, type RenderCtx } from "@/lib/email/campaign";
import { makeInert } from "@/lib/email/preview";
import type { VariableDef } from "@/lib/email/variables";

/**
 * A sent campaign's email as it was stored (campaigns.html), for the results page. Each person got their
 * own personalised copy, so no one contact is chosen: variables show their fallbacks, conditional blocks
 * for a specific contact are left out, and the countdown is filled as of when sending started.
 */
export function buildSentDoc(
  html: string,
  o: { tz: string; variables: VariableDef[]; businessAddress: string | null; workspaceName: string; sentAt?: number },
): string {
  const hasUnsubscribeBlock = html.includes(UNSUBSCRIBE_TOKEN);
  let out = fillCountdown(applyConditions(html, null), o.tz, o.sentAt);
  out = personalize(out, {}, o.variables).split(UNSUBSCRIBE_TOKEN).join("#");
  const style = `margin:16px 0 0;font-size:12px;line-height:1.6;color:${emailTheme.muted};text-align:center;`;
  const address = escapeHtml(o.businessAddress ?? "");
  const footer = hasUnsubscribeBlock
    ? `<p style="${style}">${address}</p>`
    : `<p style="${style}">You are receiving this email because you subscribed to ${escapeHtml(o.workspaceName)}.<br><u>Unsubscribe</u><br>${address}</p>`;
  out = out.includes("<!--FOOTER-->") ? out.replace("<!--FOOTER-->", footer) : out + footer;
  return makeInert(out);
}

export function buildCampaignDoc(
  design: Design,
  ctx: RenderCtx,
  o: { preheader: string; contact: ContactLike | null; variables: VariableDef[]; businessAddress: string | null; dark?: boolean },
): string {
  let html = renderCampaignHtml(design, ctx, o.preheader);
  html = fillCountdown(applyConditions(html, o.contact), ctx.tz, ctx.now);
  html = personalize(html, o.contact ?? {}, o.variables).split(UNSUBSCRIBE_TOKEN).join("#");
  const footer = `<p class="sv-mute" style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${emailTheme.muted};text-align:center;">${escapeHtml(o.businessAddress || "Your business address")}</p>`;
  html = html.replace("<!--FOOTER-->", footer);
  if (o.dark) html = html.replace("</head>", `${darkThemeCss()}</head>`);
  return makeInert(html);
}
