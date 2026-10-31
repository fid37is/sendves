import { createHmac, timingSafeEqual } from "crypto";
import { serverEnv } from "@/lib/env.server";

function secret(): string {
  if (serverEnv.appSecret.length < 16) throw new Error("APP_SECRET must be set (at least 16 characters).");
  return serverEnv.appSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Unsubscribe token: "<sendId>.<signature>" */
export function unsubscribeToken(sendId: string): string {
  return `${sendId}.${sign(`u:${sendId}`)}`;
}

export function parseUnsubscribeToken(token: string): string | null {
  const [sendId, sig] = token.split(".");
  if (!sendId || !sig) return null;
  return safeEqual(sig, sign(`u:${sendId}`)) ? sendId : null;
}

export const openSig = (sendId: string) => sign(`o:${sendId}`);
export const clickSig = (sendId: string, url: string) => sign(`c:${sendId}:${url}`);
export const verifyOpenSig = (sendId: string, sig: string) => safeEqual(sig, openSig(sendId));
export const verifyClickSig = (sendId: string, url: string, sig: string) => safeEqual(sig, clickSig(sendId, url));

/** Invitation token: "<inviteId>.<signature>". Signed, so the link can be re-created without storing a secret. */
export function inviteToken(inviteId: string): string {
  return `${inviteId}.${sign(`i:${inviteId}`)}`;
}

export function parseInviteToken(token: string): string | null {
  const [inviteId, sig] = String(token ?? "").split(".");
  if (!inviteId || !sig) return null;
  return safeEqual(sig, sign(`i:${inviteId}`)) ? inviteId : null;
}
