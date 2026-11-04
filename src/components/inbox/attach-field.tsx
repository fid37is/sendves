"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { checkAttachmentSet } from "@/lib/inbox";

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Chooses files to send with an email. Checks the limits as they are picked, so the person hears at once. */
export function AttachFiles({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])];
    const problem = checkAttachmentSet(next.map((f) => ({ name: f.name, size: f.size })));
    if (problem) toast.error(problem);
    else onChange(next);
    if (input.current) input.current.value = ""; // the same file can be chosen again
  }

  return (
    <>
      <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} aria-label="Attach files" />
      <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        Attach
      </Button>
      {files.length > 0 ? (
        <ul className="flex w-full flex-wrap gap-2" aria-label="Files to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 py-1 pl-3 pr-1.5 text-xs text-ink-soft">
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <span className="text-ink-muted">{size(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded-full p-0.5 text-ink-muted hover:bg-mist hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** The paperclip for a composer's toolbar. Checks the limits as files are picked, counting the files a draft already holds. */
export function AttachIconButton({ files, kept = [], onChange, disabled }: { files: File[]; kept?: { name: string; size: number }[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])];
    const problem = checkAttachmentSet([...kept, ...next].map((f) => ({ name: f.name, size: f.size })));
    if (problem) toast.error(problem);
    else onChange(next);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} aria-label="Attach files" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        title="Attach files"
        aria-label="Attach files"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink disabled:pointer-events-none disabled:opacity-60"
      >
        <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </>
  );
}

/** The files chosen for an email: the ones kept with a draft, and the ones just picked. */
export function FileChips({
  files, kept = [], onRemoveFile, onRemoveKept, disabled,
}: {
  files: File[];
  kept?: { id: string; name: string; size: number }[];
  onRemoveFile: (index: number) => void;
  onRemoveKept: (id: string) => void;
  disabled?: boolean;
}) {
  if (files.length + kept.length === 0) return null;
  const chip = "inline-flex items-center gap-1.5 rounded-full bg-mist-100 py-1 pl-3 pr-1.5 text-xs text-ink-soft";
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files to send">
      {kept.map((a) => (
        <li key={a.id} className={chip}>
          <span className="max-w-[12rem] truncate">{a.name}</span>
          <span className="text-ink-muted">{size(a.size)}</span>
          <button type="button" aria-label={`Remove ${a.name}`} disabled={disabled} onClick={() => onRemoveKept(a.id)} className="rounded-full p-0.5 text-ink-muted hover:bg-mist hover:text-ink"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </li>
      ))}
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className={chip}>
          <span className="max-w-[12rem] truncate">{f.name}</span>
          <span className="text-ink-muted">{size(f.size)}</span>
          <button type="button" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => onRemoveFile(i)} className="rounded-full p-0.5 text-ink-muted hover:bg-mist hover:text-ink"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </li>
      ))}
    </ul>
  );
}