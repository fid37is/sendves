export type Role = "user" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled" | "failed";
export type ContactStatus = "subscribed" | "unsubscribed" | "bounced" | "complained" | "cleaned";
export type WorkspaceStatus = "active" | "review" | "suspended";

/** Query-string values handed to pages. Never render these as messages; use toasts. */
export type SearchParams = { [key: string]: string | undefined };
