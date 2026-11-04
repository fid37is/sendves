"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubscribeToken } from "@/lib/tokens";
import { unsubscribeByRef } from "@/server/compliance";

export async function unsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const ref = parseUnsubscribeToken(token);
  if (!ref) redirect(`/u/${encodeURIComponent(token)}`);
  await unsubscribeByRef(createAdminClient(), ref);
  redirect(`/u/${encodeURIComponent(token)}?done=1`);
}
