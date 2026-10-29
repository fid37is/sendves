import { createVerify } from "crypto";

/**
 * Verifies the signature on an Amazon SNS message, as described in the SNS docs. Without this,
 * anyone who learned the webhook URL could forge bounce or complaint events.
 */
const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
const certCache = new Map<string, string>();

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
const SUBSCRIPTION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

function stringToSign(m: Record<string, unknown>): string | null {
  const keys = m.Type === "Notification" ? NOTIFICATION_KEYS : m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation" ? SUBSCRIPTION_KEYS : null;
  if (!keys) return null;
  return keys.filter((k) => m[k] !== undefined).map((k) => `${k}\n${m[k]}\n`).join("");
}

async function certificate(urlText: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return null;
  }
  // Only fetch certificates from AWS itself. Anything else could be an attacker's own key.
  if (url.protocol !== "https:" || !CERT_HOST.test(url.hostname) || !url.pathname.endsWith(".pem")) return null;
  const cached = certCache.get(url.href);
  if (cached) return cached;
  const res = await fetch(url.href, { cache: "no-store" });
  if (!res.ok) return null;
  const pem = await res.text();
  if (!pem.includes("BEGIN CERTIFICATE")) return null;
  certCache.set(url.href, pem);
  return pem;
}

export async function verifySnsMessage(m: Record<string, any>): Promise<boolean> {
  try {
    if (typeof m.Signature !== "string" || typeof m.SigningCertURL !== "string") return false;
    const toSign = stringToSign(m);
    const pem = toSign ? await certificate(m.SigningCertURL) : null;
    if (!toSign || !pem) return false;
    const algorithm = m.SignatureVersion === "2" ? "RSA-SHA256" : m.SignatureVersion === "1" ? "RSA-SHA1" : null;
    if (!algorithm) return false;
    return createVerify(algorithm).update(toSign, "utf8").verify(pem, m.Signature, "base64");
  } catch {
    return false;
  }
}
