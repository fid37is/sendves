import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FlashToast } from "@/components/ui/flash-toast";
import { Logo } from "@/components/ui/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscribeAction } from "./actions";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SubscribePage({ params, searchParams }: { params: { listId: string }; searchParams: { done?: string } }) {
  let name = "";
  if (/^[0-9a-f-]{36}$/i.test(params.listId)) {
    try {
      const { data } = await createAdminClient().from("lists").select("name, workspaces(name)").eq("id", params.listId).maybeSingle();
      name = (data as any)?.workspaces?.name ?? "";
    } catch { /* shown as unavailable below */ }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
      <FlashToast />
      <Logo href="/" />
      <div className="mt-10 w-full max-w-md rounded-3xl border border-mist p-8">
        {!name ? (
          <p className="text-center text-ink-soft">This signup form isn’t available.</p>
        ) : searchParams.done ? (
          <p className="text-center text-lg font-semibold text-ink">Thanks, you’re subscribed.</p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-ink">Subscribe to {name}</h1>
            <p className="mb-6 mt-2 text-sm text-ink-soft">Get emails from {name}. You can unsubscribe at any time.</p>
            <form action={subscribeAction} className="space-y-5">
              <input type="hidden" name="listId" value={params.listId} />
              <Field label="First name" htmlFor="firstName"><Input id="firstName" name="firstName" autoComplete="given-name" /></Field>
              <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
              <div className="hidden" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
              <Button type="submit" size="lg" className="w-full">Subscribe</Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
