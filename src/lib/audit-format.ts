/** Turns raw audit-log rows (snake_case keys, UUIDs, JSON) into something an administrator can read. */

export type AuditDetail = { label: string; value: string; full?: string };
export type AuditTarget = { type: string; id: string; full?: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABELS: Record<string, string> = {
  workspace_id: "Workspace",
  workspace: "Workspace",
  daily: "Daily limit",
  contacts: "Max contacts",
  plan: "Plan",
  role: "Role",
  from_role: "Previous role",
  mode: "Mode",
  email: "Email",
  departments: "Departments",
  registrations_open: "Registrations open",
  require_review: "Review new workspaces",
  blocked_email_domains: "Blocked email domains",
  new_workspace_daily_limit: "New workspace daily limit",
  new_workspace_max_contacts: "New workspace max contacts",
  pause_bounce_pct: "Pause at bounce %",
  pause_complaint_pct: "Pause at complaint %",
  suspend_complaint_pct: "Suspend at complaint %",
  health_min_sample: "Minimum sample",
  window_days: "Window (days)",
  sending_paused: "Sending paused",
};

const TYPE_LABELS: Record<string, string> = {
  platform_settings: "Platform settings",
  abuse_report: "Abuse report",
};

const humanize = (key: string) => {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const short = (s: string) => (UUID.test(s) ? `${s.slice(0, 8)}…` : s);

function scalar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map(scalar).join(", ") : "None";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("from" in o && "to" in o) return `${scalar(o.from)} → ${scalar(o.to)}`;
    return JSON.stringify(v);
  }
  return short(String(v));
}

export function auditDetails(meta: unknown): AuditDetail[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const entries = Object.entries(meta as Record<string, unknown>);
  if (!entries.length) return [];

  // { from, to } on its own is a status change (e.g. review → active).
  const keys = entries.map(([k]) => k).sort().join(",");
  if (keys === "from,to") {
    const m = meta as Record<string, unknown>;
    return [{ label: "Status", value: `${scalar(m.from)} → ${scalar(m.to)}` }];
  }

  // A settings save stores only what changed: { changes: { key: { from, to } } }.
  const flat = entries.flatMap(([k, v]) =>
    k === "changes" && v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>) : [[k, v] as [string, unknown]],
  );

  return flat.map(([k, v]) => ({
    label: LABELS[k] ?? humanize(k),
    value: scalar(v),
    full: typeof v === "string" && UUID.test(v) ? v : undefined,
  }));
}

export function auditTarget(type: string | null, id: string | null): AuditTarget {
  if (!type && !id) return null;
  const t = type ? TYPE_LABELS[type] ?? humanize(type) : "";
  if (!id || type === "platform_settings") return { type: t || "—", id: "" };
  return { type: t, id: short(id), full: UUID.test(id) ? id : undefined };
}
