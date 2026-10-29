export type OutboundEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
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
