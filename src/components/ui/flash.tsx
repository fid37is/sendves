/** Shows the ?ok= / ?err= message set by server actions. */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return err ? (
    <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p>
  ) : (
    <p role="status" className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{ok}</p>
  );
}

export type SearchParams = { ok?: string; err?: string; [key: string]: string | undefined };
