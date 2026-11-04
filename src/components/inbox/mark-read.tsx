"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markReadAction } from "@/app/(dashboard)/app/inbox/actions";

/** Opening an unread conversation reads it. Renders nothing; refreshes so the list and the menu count catch up. */
export function MarkRead({ conversationId, unread }: { conversationId: string; unread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    let live = true;
    markReadAction(conversationId).then((res) => { if (live && res.ok) router.refresh(); }).catch(() => {});
    return () => { live = false; };
  }, [conversationId, unread, router]);
  return null;
}
