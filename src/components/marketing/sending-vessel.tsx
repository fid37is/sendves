import Image from "next/image";
import { Section } from "@/components/marketing/section";

/** A full-width photo band on the home page: a loaded vessel under way, with a small caption. The image is public/images/sending-vessel.jpg. */
export function SendingVessel() {
  return (
    <Section className="py-12 sm:py-16">
      <figure className="relative overflow-hidden rounded-3xl border border-mist shadow-xl shadow-brand-900/10">
        <div className="relative aspect-[4/3] sm:aspect-[16/8] lg:aspect-[21/9]">
          <Image
            src="/images/sending-vessel.jpg"
            alt="Aerial view of a cargo vessel loaded with containers, sailing across calm teal water"
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover [object-position:60%_48%]"
          />
        </div>
        <figcaption className="absolute bottom-4 left-4 rounded-full bg-white/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-800 shadow-sm backdrop-blur sm:bottom-6 sm:left-6 sm:text-sm">
          Sending Vessel
        </figcaption>
      </figure>
    </Section>
  );
}
