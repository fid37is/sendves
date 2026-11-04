export type OutboundEmail = {
  from: string;
  to: string;
  /** Copied and blind-copied recipients. A Bcc address never appears in the message headers. */
  /** More people in To, besides `to`. */
  alsoTo?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  /** Where replies go. Set when the inbox can receive them (see INBOUND_DOMAIN). */
  replyTo?: string;
  /** Files sent with the email. Only single emails written in the inbox carry any. */
  attachments?: { filename: string; contentType: string; content: Buffer }[];
  tags?: Record<string, string>;
};

export type DomainStatus = { verifiedForSending: boolean; dkimStatus: "success" | "pending" | "failed" };

export interface MailProvider {
  name: "console" | "ses";
  send(email: OutboundEmail): Promise<{ messageId: string }>;
  /** Registers a domain and returns the DKIM tokens used for its CNAME records. */
  ensureDomain(domain: string): Promise<{ dkimTokens: string[] }>;
  getDomainStatus(domain: string): Promise<DomainStatus>;
  removeDomain(domain: string): Promise<void>;
}

/** Thrown for failures that retrying will not fix (rejected content, bad address). */
export class PermanentSendError extends Error {}
