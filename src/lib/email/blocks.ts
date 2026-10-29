/**
 * Email block model and renderer. Pure functions with no server dependencies, so the
 * editor preview (browser) and the sending engine (server) produce identical HTML.
 */
export type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; url: string; alt: string; link?: string }
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "html"; html: string };

export const ACCENT = "#FF0000";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeUrl(u: string): string {
  return /^(https?:\/\/|mailto:)/i.test(u.trim()) ? escapeHtml(u.trim()) : "#";
}

function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3A4263;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "heading":
      return `<h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;font-weight:800;color:#0B1233;">${escapeHtml(b.text)}</h1>`;
    case "text":
      return paragraphs(b.text);
    case "image": {
      const img = `<img src="${safeUrl(b.url)}" alt="${escapeHtml(b.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px;">`;
      return `<div style="margin:0 0 16px;">${b.link ? `<a href="${safeUrl(b.link)}">${img}</a>` : img}</div>`;
    }
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${ACCENT};border-radius:999px;"><a href="${safeUrl(b.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)}</a></td></tr></table>`;
    case "divider":
      return `<hr style="border:0;border-top:1px solid #E4DCEF;margin:24px 0;">`;
    case "spacer":
      return `<div style="height:${Math.min(Math.max(Number(b.height) || 16, 4), 120)}px;line-height:1px;">&nbsp;</div>`;
    case "html":
      return b.html;
  }
}

/** Full HTML document. The server adds the compliance footer and tracking after this. */
export function renderBlocks(blocks: Block[], opts: { preview?: string } = {}): string {
  const pre = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preview)}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#F3EFF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${pre}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;">` +
    `<tr><td style="padding:32px 32px 16px;">${blocks.map(renderBlock).join("")}</td></tr></table>` +
    `<!--FOOTER--></td></tr></table></body></html>`;
}

/** Replaces {{first_name|fallback}}, {{last_name}} and {{email}}. Values are HTML-escaped. */
export function personalize(html: string, vars: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
  return html.replace(/\{\{\s*(first_name|last_name|email)\s*(?:\|\s*([^}]*?))?\s*\}\}/g, (_m, key: string, fallback?: string) => {
    const value = (vars as Record<string, string | null | undefined>)[key];
    return escapeHtml((value && value.trim()) || (fallback ?? "").trim());
  });
}
