import "server-only";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { escapeHtml } from "@/lib/email/blocks";
import { inviteToken } from "@/lib/tokens";
import { ROLE_LABEL, type MemberRole } from "@/lib/access";
import { getProvider } from "@/server/sending/providers";

/** The invitation page is public: the person has no account yet, so it lives outside /app. */
export const inviteLink = (inviteId: string) => `${env.siteUrl}/invite/${encodeURIComponent(inviteToken(inviteId))}`;

async function sendPlatformEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!serverEnv.platformFrom) return false;
  try {
    await getProvider().send({ from: serverEnv.platformFrom, to, subject, html, text, headers: {} });
    return true;
  } catch (err) {
    console.error("[team] platform email failed:", (err as Error).message);
    return false;
  }
}

const shell = (inner: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0F172A;">${inner}</div>`;
const button = (href: string, label: string) =>
  `<p style="margin:24px 0;"><a href="${href}" style="background:#164E63;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">${label}</a></p>`;

/**
 * Emails an invitation to the person's PERSONAL (contact) address. Their login is the company email
 * the owner created for them, and they set its password from this link. Returns false (and never
 * throws) when the platform address isn't configured or sending fails, so the caller can fall back
 * to showing the link.
 */
export async function sendInviteEmail(args: { inviteId: string; to: string; loginEmail: string; organization: string; inviter: string; role: MemberRole }): Promise<boolean> {
  const link = inviteLink(args.inviteId);
  const org = escapeHtml(args.organization);
  const html = shell(
    `<h2 style="margin:0 0 12px;">You’re invited to ${org} on Sendves</h2>` +
    `<p style="line-height:1.6;">${escapeHtml(args.inviter)} set up an account for you as <strong>${ROLE_LABEL[args.role]}</strong>. You’ll sign in with your company email <strong>${escapeHtml(args.loginEmail)}</strong>.</p>` +
    button(link, "Create your password") +
    `<p style="font-size:13px;color:#475569;line-height:1.6;">The link expires in 7 days. This address is only used to send you this invitation and to recover your password: you don’t sign in with it. If you weren’t expecting this, ignore this email.</p>`,
  );
  const text = `${args.inviter} set up an account for you on Sendves (${args.organization}) as ${ROLE_LABEL[args.role]}.\n\nYou’ll sign in with your company email: ${args.loginEmail}\nCreate your password: ${link}\n\nThe link expires in 7 days. This address is only used for this invitation and password recovery.`;
  return sendPlatformEmail(args.to, `You’re invited to ${args.organization} on Sendves`, html, text);
}

/** Emails a password-recovery link to a person's recovery email. */
export async function sendRecoveryEmail(args: { to: string; loginEmail: string; link: string }): Promise<boolean> {
  const html = shell(
    `<h2 style="margin:0 0 12px;">Reset your Sendves password</h2>` +
    `<p style="line-height:1.6;">Someone asked to reset the password for <strong>${escapeHtml(args.loginEmail)}</strong>. Use the button below to choose a new one.</p>` +
    button(args.link, "Choose a new password") +
    `<p style="font-size:13px;color:#475569;line-height:1.6;">If you didn’t ask for this, ignore this email: your password stays the same.</p>`,
  );
  const text = `Reset the password for ${args.loginEmail}: ${args.link}\n\nIf you didn’t ask for this, ignore this email.`;
  return sendPlatformEmail(args.to, "Reset your Sendves password", html, text);
}
