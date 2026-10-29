import { cn } from "@/lib/utils";
import { SpeedLines } from "@/components/motion/speed-lines";

export function Section({
  children,
  tone = "white",
  className,
  id,
}: {
  children: React.ReactNode;
  tone?: "white" | "tint" | "dark" | "brand" | "night";
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        !className?.includes("py-") && "py-16 sm:py-24",
        tone === "white" && "bg-white",
        tone === "tint" && "bg-mist-50",
        (tone === "dark" || tone === "night") && "relative overflow-hidden bg-night text-white",
        tone === "brand" && "relative overflow-hidden bg-brand-700 text-white",
        className,
      )}
    >
      <div className="relative mx-auto max-w-page px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({
  title,
  description,
  align = "center",
  light = false,
}: {
  title: string;
  description?: string;
  align?: "center" | "left";
  light?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <h2 className={cn("text-3xl font-extrabold sm:text-4xl", light ? "text-white" : "text-ink")}>{title}</h2>
      {description ? <p className={cn("mt-4 text-lg", light ? "text-white" : "text-ink-soft")}>{description}</p> : null}
    </div>
  );
}

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-mist rounded-2xl border border-mist bg-white">
      {items.map((item) => (
        <details key={item.q} className="faq-item group px-6">
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-left text-base font-bold text-ink">
            {item.q}
            <span className="text-xl font-medium text-brand-800 transition-transform duration-300 group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <p className="pb-5 text-ink-soft">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function PageIntro({ title, description }: { title: string; description?: string }) {
  return (
    <div className="relative overflow-hidden bg-white pb-6 pt-14 sm:pt-20">
      <SpeedLines tone="light" className="[mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto max-w-page px-5 sm:px-8">
        <h1 className="animate-rise max-w-3xl text-4xl font-extrabold leading-tight text-ink sm:text-5xl">{title}</h1>
        {description ? <p className="animate-rise mt-5 max-w-2xl text-lg text-ink-soft" style={{ animationDelay: "0.12s" }}>{description}</p> : null}
      </div>
    </div>
  );
}
