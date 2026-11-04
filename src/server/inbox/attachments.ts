import "server-only";
import { randomUUID } from "crypto";
import type { Db } from "@/lib/supabase/admin";
import { checkFile } from "@/lib/file-check";
import type { AttachmentInfo } from "@/lib/inbox";

/** A private bucket, created by migration 0012. Files are only ever opened through /api/inbox/attachments. */
export const INBOX_ATTACHMENT_BUCKET = "inbox-attachments";

/** What is saved in inbox_messages.attachments for one file. `path` never leaves the server. `reason` says why a file was not kept. */
export type StoredAttachment = AttachmentInfo & { path: string | null };

/** A file name that is safe as part of a storage path and as a download name. */
export function safeFileName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f"<>:|?*]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || "attachment";
}

/** Keeps one file. A file that runs programs, or can't be stored, is listed as blocked and not kept. */
export async function storeAttachment(
  db: Db,
  where: { workspaceId: string; conversationId: string; messageId: string },
  file: { name: string; type: string; content: Buffer },
): Promise<StoredAttachment> {
  const id = randomUUID();
  const name = safeFileName(file.name);
  const type = String(file.type || "application/octet-stream").slice(0, 100);
  const info = { id, name, size: file.content.length, type };
  // By its name AND by what is really inside (lib/file-check.ts): a program renamed .pdf is not kept either.
  const verdict = checkFile(name, file.content);
  if (!verdict.ok) return { ...info, blocked: true, reason: verdict.reason, path: null };

  const path = `${where.workspaceId}/${where.conversationId}/${where.messageId}/${id}`;
  const { error } = await db.storage.from(INBOX_ATTACHMENT_BUCKET).upload(path, file.content, { contentType: "application/octet-stream", upsert: false });
  if (error) {
    console.error("[inbox attachments] upload failed:", error.message);
    return { ...info, blocked: true, path: null };
  }
  return { ...info, blocked: false, path };
}

export async function readAttachment(db: Db, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(INBOX_ATTACHMENT_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function removeAttachments(db: Db, paths: (string | null)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length > 0) await db.storage.from(INBOX_ATTACHMENT_BUCKET).remove(list);
}
