/**
 * Plain text and email-body helpers for the inbox. Pure and dependency-free, so they run (and are tested)
 * without the database or the mail provider.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Only http(s) links are made clickable. The text is escaped first, so nothing typed can become markup. */
function linkify(escaped: string): string {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+/gi, (url) => {
    const trail = /[.,;:!?)]+$/.exec(url)?.[0] ?? "";
    const clean = trail ? url.slice(0, -trail.length) : url;
    return `<a href="${clean}" style="color:#1D4ED8;">${clean}</a>${trail}`;
  });
}

/** What someone types in the reply box, as email HTML: paragraphs, line breaks and links. */
export function textToHtml(text: string): string {
  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 14px;">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0F172A;">${body}</div>`;
}

export function htmlToPlain(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Re: Re: Hello" and "RE: Hello" both become "Re: Hello". */
export function replySubject(subject: string): string {
  const base = String(subject ?? "").replace(/^\s*((re|aw|sv)\s*:\s*)+/i, "").trim();
  return `Re: ${base || "(no subject)"}`.slice(0, 200);
}

export function snippetOf(text: string, max = 140): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Separates what the person just wrote from the history their mail program quotes underneath it, so a long
 * thread isn't a wall of repeated text. The history is kept (collapsed), never thrown away.
 */
export function splitQuoted(text: string): { body: string; quoted: string } {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    const isWrote =
      /^\s*On\s.+wrote:\s*$/i.test(line) ||
      (/^\s*On\s.+[^:]$/i.test(line) && /^\s*.*wrote:\s*$/i.test(next) && line.length < 200);
    const isDivider = /^\s*-{2,}\s*(Original Message|Forwarded message)\s*-{2,}\s*$/i.test(line);
    const isOutlook = /^\s*From:\s.+/i.test(line) && /^\s*(Sent|Date):\s/i.test(next);
    const isOutlookRule = /^\s*_{10,}\s*$/.test(line) && /^\s*From:\s/i.test(next);
    const isQuote = /^\s*>/.test(line);
    if (isWrote || isDivider || isOutlook || isOutlookRule || isQuote) {
      cut = i;
      break;
    }
  }
  if (cut <= 0) return { body: lines.join("\n").trim(), quoted: "" };
  const body = lines.slice(0, cut).join("\n").trim();
  if (!body) return { body: lines.join("\n").trim(), quoted: "" };
  return { body, quoted: lines.slice(cut).join("\n").trim() };
}

/**
 * Out-of-office replies, delivery notices and other robots. They are stored with the conversation, but they
 * are not a person answering: they don't mark it unread, reopen it, or count as a reply.
 */
export function isAutoReply(headers: Record<string, string | undefined>, from: string, subject: string): boolean {
  const h = (k: string) => (headers[k] ?? "").toLowerCase().trim();
  const autoSubmitted = h("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers["x-autoreply"] !== undefined || headers["x-autorespond"] !== undefined) return true;
  if (["bulk", "junk", "auto_reply"].includes(h("precedence"))) return true;
  const local = from.toLowerCase().split("@")[0] ?? "";
  if (/^(mailer-daemon|postmaster)$/.test(local)) return true;
  return /^\s*(automatic reply|auto[- ]?reply|autoreply|out of office|undeliverable|delivery status notification|mail delivery failed)/i.test(subject);
}

/**
 * A reply that is, in effect, an unsubscribe request: short, and it says so ("unsubscribe", "remove me",
 * "stop emailing me"). Long messages that merely mention the word are left for a person to read.
 */
export function looksLikeUnsubscribe(text: string): boolean {
  const body = splitQuoted(text).body.replace(/\s+/g, " ").trim();
  if (!body || body.length > 90) return false;
  return /\b(unsubscribe|un-subscribe|opt[- ]?out|remove me|take me off|stop (emailing|sending|contacting|messaging)( me)?|do not (email|contact) me|don'?t (email|contact) me)\b/i.test(body)
    || /^(stop|cancel|remove)[.! ]*$/i.test(body);
}
