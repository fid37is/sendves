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
