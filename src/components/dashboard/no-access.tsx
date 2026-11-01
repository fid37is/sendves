import { EmptyState, PageHeader } from "@/components/ui/page-header";

/** Shown instead of a page the person's role doesn't include. The data is also refused on the server. */
export function NoAccess({ title, what }: { title: string; what: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        title="You don’t have access to this page"
        description={`Your role doesn’t include ${what}. Ask an organization owner if you need it.`}
      />
    </>
  );
}
