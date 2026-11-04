/** Dates for the inbox, formatted on the server in the organization's time zone so the page never shifts when it loads. */

function zone(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC" });
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}

const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** For the list: "2:15 PM" today, "Mon" this week, "Oct 30" before that, with the year once it is a different one. */
export function listTime(iso: string, tz: string | null | undefined, now = new Date()): string {
  const z = zone(tz);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (dayKey(d, z) === dayKey(now, z)) return new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "numeric", minute: "2-digit" }).format(d);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return new Intl.DateTimeFormat("en-US", { timeZone: z, weekday: "short" }).format(d);
  const sameYear = new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric" }).format(d) === new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat("en-US", { timeZone: z, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** For a message in a conversation: "Nov 2, 2026, 3:04 PM". */
export function messageTime(iso: string, tz: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone(tz), month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

/** For a message in an open conversation, the way a mail program shows it: "Thu 22 Oct, 11:56", with the year once it is a different one. */
export function gmailDate(iso: string, tz: string | null | undefined, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const z = zone(tz);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: z, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const thisYear = new Intl.DateTimeFormat("en-GB", { timeZone: z, year: "numeric" }).format(now);
  return `${parts.weekday} ${parts.day} ${parts.month}${parts.year === thisYear ? "" : ` ${parts.year}`}, ${parts.hour}:${parts.minute}`;
}

/** "(12 days ago)", "(3 hours ago)", "(just now)". */
export function agoLabel(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const unit = (n: number, word: string) => `(${n} ${word}${n === 1 ? "" : "s"} ago)`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "(just now)";
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return unit(days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return unit(months, "month");
  return unit(Math.floor(days / 365), "year");
}

/** For a scheduled email: the exact day and time, e.g. "Fri 6 Nov, 09:00". */
export const scheduleTime = (iso: string, tz: string | null | undefined): string => gmailDate(iso, tz);

/** "31–60 of 120", as a mail program shows the page you are on. */
export function rangeLabel(page: number, size: number, total: number): string {
  if (total === 0) return "0 of 0";
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return from === to ? `${from} of ${total}` : `${from}–${to} of ${total}`;
}

/** The page numbers to show: the first, the last, and a few around the current one, with null where a gap is. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const keep = new Set<number>([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { keep.add(2); keep.add(3); keep.add(4); }
  if (page >= pages - 2) { keep.add(pages - 1); keep.add(pages - 2); keep.add(pages - 3); }
  const sorted = Array.from(keep).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push(null); out.push(n); });
  return out;
}