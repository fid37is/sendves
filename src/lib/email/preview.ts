/**
 * The HTML shown in every preview (campaign editor, template editor, template cards).
 * Pure, so the browser and the server build exactly the same document.
 */
import { emailTheme } from "@/config/brand";
import { personalize, renderBlocks, type Block } from "@/lib/email/blocks";
import type { RecipientData, VariableDef } from "@/lib/email/variables";

export type PreviewVars = RecipientData;

/** Shown when no real contact is chosen. */
export const SAMPLE_VARS: Required<Pick<RecipientData, "first_name" | "last_name" | "email">> = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

/**
 * Makes a preview document safe to click on: links lose their destination and buttons ignore the
 * pointer, so a "Shop now" button in a preview does nothing. (The preview iframe is also sandboxed.)
 */
export function makeInert(html: string): string {
  const stripped = html.replace(/<a\b([^>]*?)\shref="[^"]*"/gi, '<a tabindex="-1" data-preview-link="true"$1');
  const css = "<style>a,button{pointer-events:none!important;cursor:default!important}</style>";
  return stripped.includes("</head>") ? stripped.replace("</head>", `${css}</head>`) : css + stripped;
}

export function buildPreviewDoc(
  blocks: Block[],
  opts: {
    preview?: string;
    workspaceName: string;
    businessAddress?: string | null;
    vars?: PreviewVars;
    /** Variable definitions (campaign values and fallbacks) so previews resolve like the real send. */
    variables?: VariableDef[];
    /** Previews are non-interactive by default. */
    inert?: boolean;
  },
): string {
  const strip = (s: string) => s.replace(/</g, "");
  const footer =
    `<p style="margin:16px 0 0;font-size:12px;color:${emailTheme.muted};text-align:center;">` +
    `You are receiving this email because you subscribed to ${strip(opts.workspaceName)}.<br><u>Unsubscribe</u><br>` +
    `${strip(opts.businessAddress ?? "Your business address")}</p>`;
  const doc = personalize(renderBlocks(blocks, { preview: opts.preview }), opts.vars ?? SAMPLE_VARS, opts.variables ?? []).replace("<!--FOOTER-->", footer);
  return opts.inert === false ? doc : makeInert(doc);
}

/** Subject line with variables filled in, as plain text. */
export function previewSubject(subject: string, vars: PreviewVars = SAMPLE_VARS, variables: VariableDef[] = []): string {
  return personalize(subject, vars, variables).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
