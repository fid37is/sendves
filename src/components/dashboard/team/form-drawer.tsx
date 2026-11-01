// src/components/dashboard/team/form-drawer.tsx
"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Drawer } from "@/components/dashboard/drawer";
import type { TeamResult } from "@/app/(dashboard)/app/team/actions";

/**
 * State for a form that lives in a drawer and calls a server action that returns a TeamResult.
 * An error is shown as a toast and the drawer stays open with everything typed; success shows a
 * toast and closes the drawer.
 */
export function useDrawerForm(action: (formData: FormData) => Promise<TeamResult>, onSuccess: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    setPending(true);
    try {
      const res = await action(data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      (res.tone === "warning" ? toast.warning : toast.success)(res.message);
      onSuccess();
      if (res.href) router.push(res.href);
    } catch (e) {
      toast.fail("Couldn’t save. Try again.", e);
    } finally {
      setPending(false);
    }
  };

  return { pending, onSubmit };
}

/** The standard drawer for a team form: title, the fields, and Cancel + a submit button pinned at the bottom. */
export function FormDrawer({
  open, onClose, title, description, icon, submitLabel, pending, onSubmit, hideFooter = false, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  submitLabel: string;
  pending: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  /** For a drawer that only explains why the form isn't available. */
  hideFooter?: boolean;
  children: ReactNode;
}) {
  const formId = `${useId()}-form`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      busy={pending}
      widthClass="max-w-[28rem]"
      onOpened={(panel) => panel.querySelector<HTMLElement>("input:not([type=hidden]), select")?.focus()}
      footer={
        hideFooter ? null : (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" form={formId} loading={pending}>{submitLabel}</Button>
          </div>
        )
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-5">{children}</form>
    </Drawer>
  );
}

/** Round initials chip used in the team tables. */
export function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-brand-800 ring-1 ring-accent-200">
      {text}
    </span>
  );
}
