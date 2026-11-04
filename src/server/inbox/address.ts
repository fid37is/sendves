import { createHmac, timingSafeEqual } from "crypto";
import { serverEnv } from "../../lib/env.server";

/**
 * Reply addresses. Every email Sendves sends can carry a Reply-To like
 *
 *     s3f2a…(32 hex).9c1d…(16 hex)@reply.sendves.com
 *
 * The first letter says what the id is: "s" a campaign send, "c" a conversation. The last part is a signature, so
 * only addresses Sendves itself made are accepted: nobody can drop mail into someone else's inbox by guessing.
 * Hex only, because some mail systems change the case of an address.
 */
export type ReplyKind = "s" | "c";

const HEX32 = /^[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mac(kind: ReplyKind, hex: string): string {
  if (serverEnv.appSecret.length < 16) throw new Error("APP_SECRET must be set (at least 16 characters).");
  return createHmac("sha256", serverEnv.appSecret).update(`r:${kind}:${hex}`).digest("hex").slice(0, 16);
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** True when replies can be received: an inbound domain is configured. */
export function inboundEnabled(): boolean {
  return Boolean(serverEnv.inbound.domain);
}

export function replyLocalPart(kind: ReplyKind, id: string): string {
  if (!UUID.test(id)) throw new Error("Not an id.");
  const hex = id.replace(/-/g, "").toLowerCase();
  return `${kind}${hex}.${mac(kind, hex)}`;
}

export function parseReplyLocalPart(local: string): { kind: ReplyKind; id: string } | null {
  const m = /^([sc])([0-9a-f]{32})\.([0-9a-f]{16})$/.exec(String(local ?? "").toLowerCase());
  if (!m || !HEX32.test(m[2])) return null;
  const kind = m[1] as ReplyKind;
  if (!same(m[3], mac(kind, m[2]))) return null;
  const h = m[2];
  return { kind, id: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` };
}

/** The Reply-To for an email, or undefined when the inbox's receiving side is not set up. */
export function replyAddress(kind: ReplyKind, id: string, displayName?: string): string | undefined {
  const domain = serverEnv.inbound.domain;
  if (!domain) return undefined;
  const address = `${replyLocalPart(kind, id)}@${domain}`;
  const name = (displayName ?? "").replace(/["<>\r\n]/g, "").trim();
  return name ? `"${name}" <${address}>` : address;
}

/** Finds the Sendves reply address among the recipients of a received message. */
export function parseReplyRecipient(recipients: readonly string[]): { kind: ReplyKind; id: string } | null {
  const domain = serverEnv.inbound.domain;
  if (!domain) return null;
  for (const raw of recipients) {
    const m = /<?([^<>\s@]+)@([^<>\s@]+)>?\s*$/.exec(String(raw ?? "").trim());
    if (!m || m[2].toLowerCase() !== domain) continue;
    const parsed = parseReplyLocalPart(m[1]);
    if (parsed) return parsed;
  }
  return null;
}
