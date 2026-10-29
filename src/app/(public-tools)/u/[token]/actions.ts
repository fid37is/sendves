"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubscribeToken } from "@/lib/tokens";
import { unsubscribeBySend } from "@/server/compliance";

export async function unsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const sendId = parseUnsubscribeToken(token);
  if (!sendId) redirect(`/u/${encodeURIComponent(token)}`);
  await unsubscribeBySend(createAdminClient(), sendId);
  redirect(`/u/${encodeURIComponent(token)}?done=1`);
}
