import { env } from "@/lib/env";

/** Reminds you the sample-data switch is on. Renders nothing once it is off. */
export function DevBanner() {
  if (!env.sampleData) return null;
  return (
    <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Sample data is on: the stats, testimonials and social proof shown on the marketing pages are placeholders.
      Set NEXT_PUBLIC_SAMPLE_DATA to false to go live.
    </p>
  );
}