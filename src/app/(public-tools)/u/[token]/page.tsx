import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubscribeToken } from "@/lib/tokens";
import { unsubscribeAction } from "./actions";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: { token: string }; searchParams: { done?: string } }) {
  const token = decodeURIComponent(params.token);
  let sender = "";
  let valid = false;

  if (token === "test") {
    return <Shell><h1 className="text-2xl font-extrabold text-ink">This is a test email</h1><p className="mt-3 text-ink-soft">The unsubscribe link works in real campaign emails. Nothing to do here.</p></Shell>;
  }

  try {
    const sendId = parseUnsubscribeToken(token);
    if (sendId) {
      const db = createAdminClient();
      const { data: send } = await db.from("sends").select("workspaces(name)").eq("id", sendId).maybeSingle();
      sender = (send as any)?.workspaces?.name ?? "";
      valid = Boolean(send);
    }
  } catch { /* shown as invalid below */ }

  if (!valid) return <Shell><h1 className="text-2xl font-extrabold text-ink">This link isn’t valid</h1><p className="mt-3 text-ink-soft">It may be incomplete or expired. Reply to the email you received if you need help.</p></Shell>;

  if (searchParams.done) {
    return (
      <Shell>
        <CircleCheck className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-extrabold text-ink">You’ve been unsubscribed</h1>
        <p className="mt-3 text-ink-soft">You won’t receive any more emails from {sender || "this sender"}.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-extrabold text-ink">Unsubscribe</h1>
      <p className="mt-3 text-ink-soft">Stop receiving emails from {sender || "this sender"}?</p>
      <form action={unsubscribeAction} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="lg" className="w-full">Yes, unsubscribe me</Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <Logo href="/" />
      <div className="mt-10 w-full max-w-md rounded-3xl border border-mist p-8 text-center">{children}</div>
    </main>
  );
}
