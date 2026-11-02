"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { inviteLinkAction } from "@/app/(dashboard)/app/team/actions";

/** Fetches the invitation link on demand (so it isn't sitting in the page) and copies it. */
export function CopyInviteLink({ inviteId }: { inviteId: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await inviteLinkAction(inviteId);
      if (!res.ok) { toast.error(res.error); return; }
      try {
        await navigator.clipboard.writeText(res.link);
        setCopied(true);
        toast.success("Invitation link copied.");
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard blocked: show the link so it can be copied by hand.
        setManual(res.link);
      }
    } catch (e) {
      toast.fail("Couldn’t get the link. Try again.", e);
    } finally {
      setBusy(false);
    }
  };

  if (manual) return <Input readOnly value={manual} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} className="h-9 w-64 text-xs" />;

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} loading={busy}>
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : busy ? null : <Link2 className="h-4 w-4" aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
