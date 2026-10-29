import { siteConfig } from "@/config/site";
import { PageIntro, Section } from "@/components/marketing/section";
import { PageToasts } from "@/components/ui/toast";

export type LegalDoc = {
  title: string;
  intro: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
};

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <PageIntro title={doc.title} description={doc.intro} />
      <Section className="pt-4 sm:pt-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-ink-muted">Last updated: {doc.updated}</p>
          {siteConfig.legalIsDraft ? (
            <PageToasts toasts={[{ id: "legal-draft", kind: "warning", message: "Draft: this document is a working draft and must be reviewed by a qualified lawyer before launch." }]} />
          ) : null}
          <div className="mt-10 space-y-10">
            {doc.sections.map((s, i) => (
              <section key={s.heading}>
                <h2 className="text-xl font-bold text-ink">{i + 1}. {s.heading}</h2>
                <div className="mt-3 space-y-3 text-ink-soft">
                  {s.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-12 text-sm text-ink-muted">
            Questions about this document? Email <a className="font-semibold text-brand-800 hover:underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
          </p>
        </div>
      </Section>
    </>
  );
}
