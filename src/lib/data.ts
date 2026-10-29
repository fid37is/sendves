/**
 * Single source of data for the dashboard and admin console.
 *
 * NEXT_PUBLIC_SAMPLE_DATA=true  -> fake stats, contacts, campaigns, users (src/lib/mock-data.ts)
 * NEXT_PUBLIC_SAMPLE_DATA=false -> empty values, so pages show real empty states
 *
 * When a Supabase table comes online, replace the matching export with a query.
 */
import { env } from "@/lib/env";
import * as sample from "@/lib/mock-data";

const on = env.sampleData;

function pick<T>(items: T[]): T[] {
  return on ? items : [];
}

export const workspace: typeof sample.workspace = on
  ? sample.workspace
  : { name: "My workspace", plan: "Free", contactsUsed: 0, contactsLimit: 500, sendsUsed: 0, sendsLimit: 2000, dailyLimit: 200 };

export const campaigns = pick(sample.campaigns);
export const contacts = pick(sample.contacts);
export const dnsRecords = pick(sample.dnsRecords);
export const adminWorkspaces = pick(sample.adminWorkspaces);
export const adminUsers = pick(sample.adminUsers);
export const reviewQueue = pick(sample.reviewQueue);
export const abuseReports = pick(sample.abuseReports);
export const suppression = pick(sample.suppression);

export const platform: typeof sample.platform = on
  ? sample.platform
  : { workspaces: 0, sent24h: 0, bounceRate: "-", complaintRate: "-" };

export const reportStats = on
  ? { delivered: "98.4%", clicked: "5.5%", bounced: "1.2%", unsubscribed: "0.2%" }
  : { delivered: "-", clicked: "-", bounced: "-", unsubscribed: "-" };

export const avgClickRate = on ? "5.5%" : "-";
export const domainName = on ? "example.com" : "No domain yet";

/** Starter templates are real product content, so they are always shown. */
export const templates = sample.templates;
