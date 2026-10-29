/**
 * SAMPLE DATA for the dashboard and admin console while Supabase is not connected.
 * Replace each export with a Supabase query as the matching table comes online.
 */
import type { CampaignStatus, ContactStatus, WorkspaceStatus } from "@/types";

export const workspace = {
  name: "Demo Workspace",
  plan: "Free",
  contactsUsed: 312,
  contactsLimit: 500,
  sendsUsed: 840,
  sendsLimit: 2000,
  dailyLimit: 200,
};

export const campaigns: { id: string; name: string; subject: string; status: CampaignStatus; audience: string; sent: number; clickRate: string; date: string }[] = [
  { id: "c1", name: "Autumn collection", subject: "Autumn collection is here", status: "sent", audience: "All subscribers", sent: 298, clickRate: "6.2%", date: "Oct 18, 2026" },
  { id: "c2", name: "October newsletter", subject: "What’s new this month", status: "sent", audience: "Newsletter", sent: 275, clickRate: "4.8%", date: "Oct 3, 2026" },
  { id: "c3", name: "Weekend offer", subject: "48 hours only", status: "scheduled", audience: "Customers", sent: 0, clickRate: "-", date: "Oct 25, 2026" },
  { id: "c4", name: "Welcome series", subject: "Welcome aboard", status: "draft", audience: "New signups", sent: 0, clickRate: "-", date: "-" },
];

export const contacts: { id: string; email: string; name: string; status: ContactStatus; lists: string; added: string }[] = [
  { id: "p1", email: "ada@example.com", name: "Ada Obi", status: "subscribed", lists: "Newsletter", added: "Oct 2, 2026" },
  { id: "p2", email: "tunde@example.com", name: "Tunde Bello", status: "subscribed", lists: "Customers", added: "Sep 28, 2026" },
  { id: "p3", email: "grace@example.com", name: "Grace Eze", status: "unsubscribed", lists: "Newsletter", added: "Sep 14, 2026" },
  { id: "p4", email: "kemi@example.com", name: "Kemi Ade", status: "bounced", lists: "Customers", added: "Aug 30, 2026" },
];

export const templates = [
  { id: "t1", name: "Simple newsletter", description: "One column with header image and button." },
  { id: "t2", name: "Product announcement", description: "Hero, three features and a call to action." },
  { id: "t3", name: "Event invitation", description: "Date, place and a clear RSVP button." },
  { id: "t4", name: "Plain text style", description: "A personal note with no images." },
];

export const dnsRecords = [
  { type: "TXT", host: "example.com", value: "v=spf1 include:amazonses.com ~all", purpose: "SPF", status: "verified" },
  { type: "CNAME", host: "sendves1._domainkey.example.com", value: "sendves1.dkim.example.net", purpose: "DKIM", status: "verified" },
  { type: "CNAME", host: "sendves2._domainkey.example.com", value: "sendves2.dkim.example.net", purpose: "DKIM", status: "pending" },
  { type: "TXT", host: "_dmarc.example.com", value: "v=DMARC1; p=none; rua=mailto:dmarc@example.com", purpose: "DMARC", status: "pending" },
];

export const platform = {
  workspaces: 128,
  sent24h: 48210,
  bounceRate: "1.4%",
  complaintRate: "0.04%",
};

export const adminWorkspaces: { id: string; name: string; owner: string; plan: string; status: WorkspaceStatus; sent30d: number; complaintRate: string }[] = [
  { id: "w1", name: "Bloom Boutique", owner: "ada@bloom.example", plan: "Starter", status: "active", sent30d: 12400, complaintRate: "0.03%" },
  { id: "w2", name: "Northside Church", owner: "pastor@northside.example", plan: "Free", status: "active", sent30d: 1800, complaintRate: "0.01%" },
  { id: "w3", name: "QuickDeals", owner: "hello@quickdeals.example", plan: "Free", status: "review", sent30d: 190, complaintRate: "0.00%" },
  { id: "w4", name: "FastLeads", owner: "team@fastleads.example", plan: "Free", status: "suspended", sent30d: 640, complaintRate: "0.9%" },
];

export const adminUsers = [
  { id: "u1", name: "Ada Obi", email: "ada@bloom.example", role: "user", joined: "Sep 2, 2026" },
  { id: "u2", name: "Pastor James", email: "pastor@northside.example", role: "user", joined: "Sep 9, 2026" },
  { id: "u3", name: "Demo Admin", email: "admin@sendves.com", role: "admin", joined: "Aug 1, 2026" },
];

export const reviewQueue = [
  { id: "r1", workspace: "QuickDeals", campaign: "Flash sale", recipients: 180, subject: "Unbelievable prices today", submitted: "10 minutes ago" },
  { id: "r2", workspace: "Green Grocer", campaign: "Welcome offer", recipients: 95, subject: "Your first order discount", submitted: "1 hour ago" },
];

export const abuseReports = [
  { id: "a1", reporter: "recipient@example.org", workspace: "FastLeads", reason: "Unsolicited promotional email", status: "open", received: "Oct 20, 2026" },
  { id: "a2", reporter: "Mailbox provider feedback loop", workspace: "FastLeads", reason: "Complaint rate above threshold", status: "resolved", received: "Oct 19, 2026" },
];

export const suppression = [
  { email: "bounce1@example.com", reason: "Hard bounce", scope: "Global", added: "Oct 21, 2026" },
  { email: "complaint1@example.com", reason: "Spam complaint", scope: "Global", added: "Oct 20, 2026" },
  { email: "optout@example.com", reason: "Unsubscribed", scope: "Workspace", added: "Oct 18, 2026" },
];
