/**
 * The HTML shown in every preview (campaign editor, template editor, template cards).
 * Pure, so the browser and the server build exactly the same document.
 */
import { emailTheme } from "@/config/brand";
import { personalize, renderBlocks, type Block } from "@/lib/email/blocks";

export type PreviewVars = { first_name?: string | null; last_name?: string | null; email?: string | null };

/** Shown when no real contact is chosen. */
export const SAMPLE_VARS: Required<PreviewVars> = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

export function buildPreviewDoc(
  blocks: Block[],
  opts: { preview?: string; workspaceName: string; businessAddress?: string | null; vars?: PreviewVars },
): string {
  const strip = (s: string) => s.replace(/</g, "");
  const footer =
    `<p style="margin:16px 0 0;font-size:12px;color:${emailTheme.muted};text-align:center;">` +
    `You are receiving this email because you subscribed to ${strip(opts.workspaceName)}.<br><u>Unsubscribe</u><br>` +
    `${strip(opts.businessAddress ?? "Your business address")}</p>`;
  return personalize(renderBlocks(blocks, { preview: opts.preview }), opts.vars ?? SAMPLE_VARS).replace("<!--FOOTER-->", footer);
}

/** Subject line with variables filled in, as plain text. */
export function previewSubject(subject: string, vars: PreviewVars = SAMPLE_VARS): string {
  return personalize(subject, vars).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
